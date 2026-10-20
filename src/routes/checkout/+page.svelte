<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import PaypalCheckout from './PaypalCheckout.svelte';
  import ItemPaymentCheckout from './ItemPaymentCheckout.svelte';
  import FormatBadge from '#lib/components/ui/FormatBadge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import type { CartLineView } from '#lib/types/cart.js';

  let { data }: { data: PageData } = $props();

  let selectedLineIds = $state<Set<number>>(new Set());
  $effect(() => {
    selectedLineIds = new Set(
      data.lines
        .filter((line: CartLineView) => !line.reservedByOther)
        .map((line: CartLineView) => line.id),
    );
  });
  let acceptedRulebook = $state(false);
  let acceptedRefundPolicy = $state(false);
  let acceptedConfirmation = $state(false);
  let acceptedPayingForOthers = $state(false);
  let selectedMethod = $state<'paypal' | 'items'>('paypal');

  const selectedLines = $derived(
    data.lines.filter((line: CartLineView) => selectedLineIds.has(line.id)),
  );

  const activeCurrency = $derived(selectedLines[0]?.currency ?? null);

  function toggleLine(line: CartLineView) {
    if (line.reservedByOther) return;
    if (selectedLineIds.has(line.id)) {
      const next = new Set(selectedLineIds);
      next.delete(line.id);
      selectedLineIds = next;
      return;
    }
    if (activeCurrency && line.currency !== activeCurrency) return;
    const next = new Set(selectedLineIds);
    next.add(line.id);
    selectedLineIds = next;
  }

  const totalPaypalAmount = $derived(
    selectedLines.reduce((sum: number, line: CartLineView) => sum + line.totalCost, 0),
  );
  const totalLeagueFees = $derived(
    selectedLines.reduce((sum: number, line: CartLineView) => sum + line.leagueFees, 0),
  );
  const currencySymbol = $derived(selectedLines[0]?.currencySymbol ?? '$');
  const currency = $derived(selectedLines[0]?.currency ?? 'USD');

  const itemConfigs = $derived(
    selectedLines.map((line: CartLineView) => line.itemPaymentConfig).filter(Boolean),
  );
  const allTeamsHaveItemPayment = $derived(
    selectedLines.length > 0 &&
      itemConfigs.length === selectedLines.length &&
      itemConfigs.every(
        (config) =>
          config!.itemName === itemConfigs[0]!.itemName &&
          config!.itemAppId === itemConfigs[0]!.itemAppId,
      ),
  );

  const hasPaypal = $derived(!!data.paypalClientId || data.isTestMode);
  const hasItemPayment = $derived(allTeamsHaveItemPayment && !!data.botTradeOfferUrl);
  const hasBothMethods = $derived(hasPaypal && hasItemPayment);

  const totalItemsRequired = $derived(
    allTeamsHaveItemPayment
      ? selectedLines.reduce(
          (sum: number, line: CartLineView) => sum + (line.itemPaymentConfig?.itemQuantity ?? 0),
          0,
        )
      : 0,
  );
  const itemName = $derived(itemConfigs[0]?.itemName ?? '');
  const selectedIdList = $derived(selectedLines.map((line: CartLineView) => line.id));

  const othersBeingPaidFor = $derived(
    selectedLines.filter((line: CartLineView) => line.playerSteamId !== data.steamId),
  );
  const isPayingForOthers = $derived(othersBeingPaidFor.length > 0);
  const payingForOthersLabel = $derived.by(() => {
    const names = [
      ...new Map(
        othersBeingPaidFor.map((line: CartLineView) => [line.playerSteamId, line.playerName]),
      ).values(),
    ];
    const nameList =
      names.length === 1
        ? names[0]
        : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    return `I confirm that I am paying the signup fee on behalf of ${nameList}, and that they have agreed to participate in the season.`;
  });

  const allAgreementsChecked = $derived(
    acceptedRulebook &&
      acceptedRefundPolicy &&
      acceptedConfirmation &&
      (!isPayingForOthers || acceptedPayingForOthers),
  );

  $effect(() => {
    selectedMethod = data.pendingItemOrder
      ? 'items'
      : hasItemPayment && !hasPaypal
        ? 'items'
        : 'paypal';
  });

  const confirmationLabel = $derived.by(() => {
    if (selectedLines.length === 0) return 'I confirm my payment selection.';
    const parts = selectedLines.map((line: CartLineView) => {
      const bits: string[] = [];
      if (line.regionName) bits.push(line.regionName);
      bits.push(line.formatName);
      if (line.seasonNum != null) bits.push(`Season ${line.seasonNum}`);
      bits.push(line.playerName);
      return bits.join(' ');
    });
    return `I confirm that I am paying for: ${parts.join(', ')}.`;
  });

  const hasCurrencyMismatch = $derived(
    data.lines.some(
      (line: CartLineView) =>
        !selectedLineIds.has(line.id) &&
        activeCurrency !== null &&
        line.currency !== activeCurrency,
    ),
  );
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="mx-auto max-w-2xl">
    <div class="mb-8 text-center">
      <h1 class="mb-2 text-4xl font-bold text-text-heading">Checkout</h1>
      <p class="text-text-muted">Pay for league participations in one transaction</p>
    </div>

    {#if data.paymentSuccess}
      <Card class="mb-6">
        <p class="text-center text-success-ink">
          Payment recorded. Paid players are marked on their teams.
        </p>
      </Card>
    {/if}

    {#if data.lines.length === 0}
      <Card>
        <div class="py-10 text-center">
          <h2 class="mb-2 text-xl font-bold text-text-heading">Your cart is empty</h2>
          <p class="mb-6 text-text-muted">
            Add unpaid players from a team page, or sign up for a paid division.
          </p>
          <Button href="/" variant="secondary">Back to Home</Button>
        </div>
      </Card>
    {:else}
      <Card padding="none" class="overflow-hidden">
        <div class="border-b border-border-default p-6">
          <h3 class="mb-3 text-sm font-medium tracking-wider text-text-muted uppercase">
            Select participations to pay
          </h3>

          {#if hasCurrencyMismatch}
            <div class="mb-3 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3">
              <p class="text-sm text-warning-ink">
                Some items use different currencies and cannot be combined in one payment.
              </p>
            </div>
          {/if}

          <div class="space-y-2">
            {#each data.lines as line (line.id)}
              {@const isSelected = selectedLineIds.has(line.id)}
              {@const currencyBlocked =
                !isSelected && activeCurrency !== null && line.currency !== activeCurrency}
              {@const blocked = currencyBlocked || line.reservedByOther}
              <div
                class="flex items-center gap-3 rounded-lg border p-3 transition-all {blocked
                  ? 'cursor-not-allowed border-border-default bg-surface-card opacity-50'
                  : isSelected
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-default bg-surface-card hover:border-border-input'}"
              >
                <input
                  type="checkbox"
                  id="line-{line.id}"
                  checked={isSelected}
                  disabled={blocked}
                  onchange={() => toggleLine(line)}
                  class="h-4 w-4 rounded border-border-input accent-primary-600"
                />
                <label
                  for="line-{line.id}"
                  class="flex min-w-0 flex-1 items-center gap-3 {blocked ? '' : 'cursor-pointer'}"
                >
                  {#if line.playerAvatar}
                    <img
                      src={line.playerAvatar}
                      alt={line.playerName}
                      class="h-8 w-8 rounded-full object-cover"
                    />
                  {/if}
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-text-heading">
                      {line.playerName}
                      {#if line.playerSteamId === data.steamId}
                        <span class="text-xs text-text-muted">(you)</span>
                      {/if}
                    </p>
                    <p class="mt-0.5 text-xs text-text-muted">
                      <FormatBadge
                        name={line.formatName}
                        themeKey={line.formatThemeKey}
                        iconUrl={line.formatIconUrl}
                        size="sm"
                      />
                      {#if !line.isIndividual}
                        <span class="mx-1">&middot;</span>{line.teamName}
                      {/if}
                      {#if line.regionName}
                        <span class="mx-1">&middot;</span>{line.regionName}
                      {/if}
                      <span class="mx-1">&middot;</span>{line.divisionName}
                    </p>
                    {#if line.reservedByOther}
                      <p class="mt-1 text-xs text-warning-ink">
                        Someone else is paying for this player
                      </p>
                    {/if}
                  </div>
                  <span class="whitespace-nowrap text-sm font-semibold text-text-heading">
                    {line.currencySymbol}{line.totalCost.toFixed(2)}
                  </span>
                </label>
                <form method="POST" action="?/remove" use:enhance>
                  <input type="hidden" name="lineId" value={line.id} />
                  <Button type="submit" variant="ghost" size="sm">Remove</Button>
                </form>
              </div>
            {/each}
          </div>
        </div>

        {#if selectedLines.length > 0}
          <div class="border-b border-border-default space-y-4 p-6">
            <h3 class="text-sm font-medium tracking-wider text-text-muted uppercase">Summary</h3>
            {#if totalLeagueFees > 0}
              <p class="text-sm text-text-body">
                League fees {currencySymbol}{totalLeagueFees.toFixed(2)}
              </p>
            {/if}
            <p class="text-lg font-bold text-text-heading">
              Total {currencySymbol}{totalPaypalAmount.toFixed(2)}
            </p>
          </div>

          <div class="border-b border-border-default space-y-4 p-6">
            <h3 class="text-sm font-medium tracking-wider text-text-muted uppercase">Agreements</h3>

            <label for="accept-rulebook" class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                id="accept-rulebook"
                bind:checked={acceptedRulebook}
                class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500"
              />
              <span class="text-sm text-text-label">
                I agree to follow the
                <a
                  href="/rulebook"
                  target="_blank"
                  class="text-primary-ink underline hover:text-primary-300"
                >
                  league rulebook
                </a>
              </span>
            </label>

            <label for="accept-refund" class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                id="accept-refund"
                bind:checked={acceptedRefundPolicy}
                class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600"
              />
              <span class="text-sm text-text-label">
                I understand that all fees are non-refundable except where staff issues a refund.
              </span>
            </label>

            <label for="accept-confirm" class="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                id="accept-confirm"
                bind:checked={acceptedConfirmation}
                class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600"
              />
              <span class="text-sm text-text-label">{confirmationLabel}</span>
            </label>

            {#if isPayingForOthers}
              <label for="accept-paying-for-others" class="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  id="accept-paying-for-others"
                  bind:checked={acceptedPayingForOthers}
                  class="mt-0.5 h-4 w-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600"
                />
                <span class="text-sm text-text-label">{payingForOthersLabel}</span>
              </label>
            {/if}
          </div>

          {#if hasBothMethods && allAgreementsChecked}
            <div class="border-b border-border-default p-6">
              <h3 class="mb-3 text-sm font-medium tracking-wider text-text-muted uppercase">
                Payment Method
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <button
                  onclick={() => (selectedMethod = 'paypal')}
                  class="rounded-lg border-2 p-4 text-left transition-all {selectedMethod ===
                  'paypal'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-default'}"
                >
                  PayPal
                </button>
                <button
                  onclick={() => (selectedMethod = 'items')}
                  class="rounded-lg border-2 p-4 text-left transition-all {selectedMethod ===
                  'items'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-default'}"
                >
                  Steam items
                </button>
              </div>
            </div>
          {/if}

          {#if allAgreementsChecked}
            <div class="p-6">
              {#if selectedMethod === 'paypal' && hasPaypal}
                {#key selectedIdList.join(',') + currency}
                  <PaypalCheckout
                    paypalClientId={data.paypalClientId}
                    {currency}
                    totalAmount={totalPaypalAmount}
                    lineIds={selectedIdList}
                    isTestMode={data.isTestMode}
                  />
                {/key}
              {:else if selectedMethod === 'items' && hasItemPayment}
                <ItemPaymentCheckout
                  lineIds={selectedIdList}
                  {itemName}
                  {totalItemsRequired}
                  botTradeOfferUrl={data.botTradeOfferUrl}
                  botProfile={data.botProfile}
                  pendingItemOrder={data.pendingItemOrder}
                />
              {:else}
                <p class="text-sm text-text-muted">
                  No payment method is available for this selection.
                </p>
              {/if}
            </div>
          {/if}
        {/if}
      </Card>
    {/if}
  </div>
</div>
