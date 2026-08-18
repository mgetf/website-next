<script lang="ts">
  import type { PageData } from './$types';
  import PaypalCheckout from './PaypalCheckout.svelte';
  import ItemPaymentCheckout from './ItemPaymentCheckout.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import type { CheckoutParticipation, CheckoutTeamSelection } from '$lib/types/checkout';
  import { isTeamFormatId } from '$lib/constants/formats';

  let { data }: { data: PageData } = $props();

  // Which participations (teams) the user has selected to pay for
  let selectedTeamIds = $state<Set<number>>(new Set());

  // Per-team player selections: Map<teamId, Set<paidForSteamId>>
  let playerSelections = $state<Map<number, Set<string>>>(new Map());

  // Agreement checkboxes
  let acceptedRulebook = $state(false);
  let acceptedRefundPolicy = $state(false);
  let acceptedConfirmation = $state(false);
  let acceptedPayingForOthers = $state(false);

  let selectedMethod = $state<'paypal' | 'items'>('paypal');

  // Nothing pre-selected — the user always picks explicitly.
  $effect(() => {
    selectedTeamIds = new Set();
    playerSelections = new Map();
  });

  const selectedParticipations = $derived(
    data.participations.filter((p: CheckoutParticipation) => selectedTeamIds.has(p.teamId)),
  );

  // Currency of the first selected participation — used to enforce currency matching
  const activeCurrency = $derived(selectedParticipations[0]?.currency ?? null);

  function toggleParticipation(teamId: number, currency: string) {
    if (selectedTeamIds.has(teamId)) {
      const next = new Set(selectedTeamIds);
      next.delete(teamId);
      selectedTeamIds = next;
    } else {
      if (activeCurrency && currency !== activeCurrency) return; // currency mismatch
      const next = new Set(selectedTeamIds);
      next.add(teamId);
      selectedTeamIds = next;
    }
  }

  function togglePlayer(teamId: number, steamId: string) {
    const teamSet = playerSelections.get(teamId) ?? new Set<string>();
    const next = new Map(playerSelections);
    const nextSet = new Set(teamSet);
    if (nextSet.has(steamId)) {
      nextSet.delete(steamId);
    } else {
      nextSet.add(steamId);
    }
    next.set(teamId, nextSet);
    playerSelections = next;
  }

  // Build the teams array for the payment components.
  // For 1v1 teams the current user is always the only payer (no player selection UI shown).
  // For 2v2 teams the explicit player selection is used.
  const checkoutTeams = $derived<CheckoutTeamSelection[]>(
    selectedParticipations.map((p) => ({
      teamId: p.teamId,
      paidForSteamIds:
        isTeamFormatId(p.formatId)
          ? [...(playerSelections.get(p.teamId) ?? new Set())]
          : [data.steamId],
    })),
  );

  // Returns the effective selected steam IDs for a participation.
  // 1v1: always the current user. 2v2: explicit player selections.
  function effectiveIds(p: CheckoutParticipation): Set<string> {
    if (!isTeamFormatId(p.formatId)) return new Set([data.steamId]);
    return playerSelections.get(p.teamId) ?? new Set<string>();
  }

  // Total PayPal amount across all selected players
  const totalPaypalAmount = $derived(
    selectedParticipations.reduce((sum, p) => {
      const ids = effectiveIds(p);
      return (
        sum +
        p.unpaidPlayers.filter((pl) => ids.has(pl.steamId)).reduce((s, pl) => s + pl.totalCost, 0)
      );
    }, 0),
  );

  // League fees to display as a separate line: sum of all leagueFees for selected players
  const totalLeagueFees = $derived(
    selectedParticipations.reduce((sum, p) => {
      const ids = effectiveIds(p);
      return (
        sum +
        p.unpaidPlayers.filter((pl) => ids.has(pl.steamId)).reduce((s, pl) => s + pl.leagueFees, 0)
      );
    }, 0),
  );

  const currencySymbol = $derived(selectedParticipations[0]?.currencySymbol ?? '$');
  const currency = $derived(selectedParticipations[0]?.currency ?? 'USD');

  // Item payment availability: all selected teams must have matching item configs
  const itemConfigs = $derived(
    selectedParticipations.map((p) => p.itemPaymentConfig).filter(Boolean),
  );

  const allTeamsHaveItemPayment = $derived(
    selectedParticipations.length > 0 &&
      itemConfigs.length === selectedParticipations.length &&
      itemConfigs.every(
        (c) =>
          c!.itemName === itemConfigs[0]!.itemName && c!.itemAppId === itemConfigs[0]!.itemAppId,
      ),
  );

  const hasPaypal = $derived(!!data.paypalClientId || data.isTestMode);
  const hasItemPayment = $derived(allTeamsHaveItemPayment && !!data.botTradeOfferUrl);
  const hasBothMethods = $derived(hasPaypal && hasItemPayment);

  const totalItemsRequired = $derived(
    allTeamsHaveItemPayment
      ? selectedParticipations.reduce((sum, p) => {
          const ids = effectiveIds(p);
          const itemQuantity = p.itemPaymentConfig!.itemQuantity;
          return (
            sum +
            itemQuantity *
              [...ids].filter((id) => p.unpaidPlayers.some((pl) => pl.steamId === id)).length
          );
        }, 0)
      : 0,
  );

  const itemName = $derived(itemConfigs[0]?.itemName ?? '');

  const totalSelectedPlayers = $derived(
    selectedParticipations.length > 0
      ? checkoutTeams.reduce((sum, t) => sum + t.paidForSteamIds.length, 0)
      : 0,
  );

  // Every selected 2v2 team must have at least one player checked before proceeding.
  const allTeamsReady = $derived(
    selectedParticipations.length > 0 &&
      selectedParticipations.every(
        (p) => !isTeamFormatId(p.formatId) || (playerSelections.get(p.teamId)?.size ?? 0) > 0,
      ),
  );

  // Collect names of non-self players being paid for, for the 4th checkbox
  const othersBeingPaidFor = $derived(
    selectedParticipations.flatMap((p) => {
      const ids = effectiveIds(p);
      return p.unpaidPlayers.filter((pl) => pl.steamId !== data.steamId && ids.has(pl.steamId));
    }),
  );

  const isPayingForOthers = $derived(othersBeingPaidFor.length > 0);

  const payingForOthersLabel = $derived(() => {
    const names = [...new Map(othersBeingPaidFor.map((pl) => [pl.steamId, pl.name])).values()];
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

  // Auto-set payment method based on pending order or available methods
  $effect(() => {
    selectedMethod = data.pendingItemOrder
      ? 'items'
      : hasItemPayment && !hasPaypal
        ? 'items'
        : 'paypal';
  });

  // Build a human-readable confirmation string for the 3rd checkbox
  const confirmationLabel = $derived(() => {
    if (selectedParticipations.length === 0) return 'I confirm my payment selection.';
    const parts = selectedParticipations.map((p) => {
      const parts2: string[] = [];
      if (p.regionName) parts2.push(p.regionName);
      parts2.push(p.formatName);
      if (p.seasonNum != null) parts2.push(`Season ${p.seasonNum}`);
      return parts2.join(' ');
    });
    return `I confirm that I am paying for my participation in: ${parts.join(', ')}.`;
  });

  const hasCurrencyMismatch = $derived(
    data.participations.some(
      (p: CheckoutParticipation) =>
        !selectedTeamIds.has(p.teamId) && activeCurrency !== null && p.currency !== activeCurrency,
    ),
  );
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-2xl mx-auto">
    <div class="mb-8 text-center">
      <h1 class="text-4xl font-bold text-white mb-2">Complete Payment</h1>
      <p class="text-text-muted">Select your pending registration(s) and complete payment</p>
    </div>

    {#if data.participations.length === 0}
      <Card>
        <div class="py-10 text-center">
          <div
            class="w-14 h-14 rounded-full bg-surface-input flex items-center justify-center mx-auto mb-5"
          >
            <svg
              class="w-7 h-7 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-white mb-2">No pending payments</h2>
          <p class="text-text-muted mb-6">
            You don't have any outstanding signup fees at the moment.
          </p>
          <Button href="/" variant="secondary">Back to Home</Button>
        </div>
      </Card>
    {:else}
      <Card padding="none" class="overflow-hidden">
        <!-- Step 1: Participation Selection -->
        <div class="p-6 border-b border-border-default">
          <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
            Select Registrations to Pay For
          </h3>

          {#if hasCurrencyMismatch}
            <div class="mb-3 p-3 bg-warning-500/10 border border-warning-500/30 rounded-lg">
              <p class="text-warning-400 text-sm">
                Some registrations use different currencies and cannot be combined in one payment.
                Select registrations in the same currency.
              </p>
            </div>
          {/if}

          <div class="space-y-2">
            {#each data.participations as p (p.teamId)}
              {@const isSelected = selectedTeamIds.has(p.teamId)}
              {@const currencyBlocked =
                !isSelected && activeCurrency !== null && p.currency !== activeCurrency}
              <label
                for="participation-{p.teamId}"
                class="flex items-center gap-3 p-3 rounded-lg border transition-all {currencyBlocked
                  ? 'border-border-default bg-surface-card opacity-50 cursor-not-allowed'
                  : isSelected
                    ? 'border-primary-500 bg-primary-500/10 cursor-pointer'
                    : 'border-border-default bg-surface-card hover:border-border-input cursor-pointer'}"
              >
                <input
                  type="checkbox"
                  id="participation-{p.teamId}"
                  checked={isSelected}
                  disabled={currencyBlocked}
                  onchange={() => toggleParticipation(p.teamId, p.currency)}
                  class="w-4 h-4 rounded border-border-input accent-primary-600"
                />
                {#if p.teamAvatar}
                  <img src={p.teamAvatar} alt={p.teamName} class="w-8 h-8 rounded object-cover" />
                {:else}
                  <div
                    class="w-8 h-8 rounded bg-surface-input flex items-center justify-center shrink-0"
                  >
                    <span class="text-xs text-text-muted">{p.teamName.charAt(0)}</span>
                  </div>
                {/if}
                <div class="flex-1 min-w-0">
                  <p class="text-white font-medium text-sm truncate">{p.teamName}</p>
                  <p class="text-text-muted text-xs mt-0.5">
                    <Badge color={isTeamFormatId(p.formatId) ? 'blue' : 'purple'} size="sm">
                      {p.formatName}
                    </Badge>
                    {#if p.regionName}
                      <span class="mx-1">&middot;</span>{p.regionName}
                    {/if}
                    <span class="mx-1">&middot;</span>{p.divisionName}
                    {#if p.seasonNum != null}
                      <span class="mx-1">&middot;</span>Season {p.seasonNum}
                    {/if}
                  </p>
                </div>
                <span class="text-white text-sm font-semibold whitespace-nowrap">
                  {p.currencySymbol}{(p.signupCost * p.unpaidPlayers.length).toFixed(2)}+
                </span>
              </label>
            {/each}
          </div>
        </div>

        <!-- Step 2: Per-team player selection (2v2 only) -->
        {#each selectedParticipations as p (p.teamId)}
          {#if isTeamFormatId(p.formatId) && p.unpaidPlayers.length > 0}
            <div class="p-6 border-b border-border-default">
              {#if selectedParticipations.length > 1}
                <!-- Team header when multiple teams selected -->
                <div class="flex items-center gap-2 mb-3">
                  {#if p.teamAvatar}
                    <img src={p.teamAvatar} alt={p.teamName} class="w-5 h-5 rounded object-cover" />
                  {/if}
                  <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider">
                    {p.teamName} — Players to Pay For
                  </h3>
                </div>
              {:else}
                <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                  Select Players to Pay For
                </h3>
                <!-- Single team: show registration info -->
                <div class="flex items-center gap-3 mb-4">
                  {#if p.teamAvatar}
                    <img
                      src={p.teamAvatar}
                      alt={p.teamName}
                      class="w-10 h-10 rounded-lg object-cover"
                    />
                  {:else}
                    <div
                      class="w-10 h-10 rounded-lg bg-surface-input border border-border-input flex items-center justify-center"
                    >
                      <span class="text-sm text-text-muted">{p.teamName.charAt(0)}</span>
                    </div>
                  {/if}
                  <div class="min-w-0">
                    <p class="text-white font-bold">{p.teamName}</p>
                    <p class="text-sm text-text-body mt-0.5">
                      <Badge color={isTeamFormatId(p.formatId) ? 'blue' : 'purple'} size="sm">
                        {p.formatName}
                      </Badge>
                      {#if p.regionName}
                        <span class="mx-1 text-text-muted">&middot;</span>{p.regionName}
                      {/if}
                      <span class="mx-1 text-text-muted">&middot;</span>{p.divisionName}
                      {#if p.seasonNum != null}
                        <span class="mx-1 text-text-muted">&middot;</span>Season {p.seasonNum}
                      {/if}
                    </p>
                  </div>
                </div>
              {/if}

              <div class="space-y-2">
                {#each p.unpaidPlayers as player (player.steamId)}
                  {@const isPlayerSelected = (playerSelections.get(p.teamId) ?? new Set()).has(
                    player.steamId,
                  )}
                  <label
                    for="player-{p.teamId}-{player.steamId}"
                    class="flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer {isPlayerSelected
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-border-default bg-surface-card hover:border-border-input'}"
                  >
                    <input
                      type="checkbox"
                      id="player-{p.teamId}-{player.steamId}"
                      checked={isPlayerSelected}
                      onchange={() => togglePlayer(p.teamId, player.steamId)}
                      class="w-4 h-4 rounded border-border-input accent-primary-600"
                    />
                    {#if player.avatar}
                      <img
                        src={player.avatar}
                        alt={player.name}
                        class="w-8 h-8 rounded-full object-cover"
                      />
                    {:else}
                      <div
                        class="w-8 h-8 rounded-full bg-surface-input flex items-center justify-center"
                      >
                        <span class="text-xs text-text-muted">{player.name.charAt(0)}</span>
                      </div>
                    {/if}
                    <div class="flex-1 min-w-0">
                      <p class="text-white font-medium text-sm truncate">
                        {player.name}
                        {#if player.steamId === data.steamId}
                          <span class="text-text-muted text-xs">(you)</span>
                        {/if}
                      </p>
                    </div>
                    <span class="text-white font-semibold text-sm whitespace-nowrap">
                      {p.currencySymbol}{player.totalCost.toFixed(2)}
                    </span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        {/each}

        <!-- Step 3: Payment summary -->
        {#if selectedParticipations.length > 0 && !allTeamsReady}
          <div class="p-6 border-b border-border-default">
            <p class="text-text-muted text-sm text-center">
              Select at least one player for each 2v2 team above to continue.
            </p>
          </div>
        {/if}

        {#if allTeamsReady}
          <!-- Agreement checkboxes -->
          <div class="p-6 border-b border-border-default space-y-4">
            <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider">Agreements</h3>

            <label for="accept-rulebook" class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="accept-rulebook"
                bind:checked={acceptedRulebook}
                class="mt-0.5 w-4 h-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900"
              />
              <span class="text-sm text-text-label">
                I agree to follow the
                <a
                  href="/rulebook"
                  target="_blank"
                  class="text-primary-400 hover:text-primary-300 underline"
                >
                  league rulebook
                </a>
              </span>
            </label>

            <label for="accept-refund" class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="accept-refund"
                bind:checked={acceptedRefundPolicy}
                class="mt-0.5 w-4 h-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900"
              />
              <span class="text-sm text-text-label">
                I understand that all fees are non-refundable. By completing this payment, I commit
                to participating for the full duration of the season.
              </span>
            </label>

            <label for="accept-confirm" class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                id="accept-confirm"
                bind:checked={acceptedConfirmation}
                class="mt-0.5 w-4 h-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900"
              />
              <span class="text-sm text-text-label">{confirmationLabel()}</span>
            </label>

            {#if isPayingForOthers}
              <label for="accept-paying-for-others" class="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  id="accept-paying-for-others"
                  bind:checked={acceptedPayingForOthers}
                  class="mt-0.5 w-4 h-4 shrink-0 rounded border-border-input bg-surface-input accent-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900"
                />
                <span class="text-sm text-text-label">{payingForOthersLabel()}</span>
              </label>
            {/if}
          </div>

          <!-- Payment method selector -->
          {#if hasBothMethods && allAgreementsChecked}
            <div class="p-6 border-b border-border-default">
              <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
                Payment Method
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <button
                  onclick={() => (selectedMethod = 'paypal')}
                  class="flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left {selectedMethod ===
                  'paypal'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-input bg-surface-input hover:border-border-default'}"
                >
                  <img src="/paypal.svg" alt="PayPal" class="h-8 w-8 shrink-0" />
                  <div>
                    <p class="text-white font-semibold">PayPal</p>
                    <p class="text-text-muted text-xs mt-0.5">Pay with PayPal or card</p>
                  </div>
                </button>
                <button
                  onclick={() => (selectedMethod = 'items')}
                  class="flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left {selectedMethod ===
                  'items'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-input bg-surface-input hover:border-border-default'}"
                >
                  <img
                    src="/steam_logo.png"
                    alt="Steam"
                    class="h-8 w-8 shrink-0 brightness-0 invert"
                  />
                  <div>
                    <p class="text-white font-semibold">Steam Items</p>
                    <p class="text-text-muted text-xs mt-0.5">Pay with {itemName}</p>
                  </div>
                </button>
              </div>
            </div>
          {/if}

          <div class="p-6">
            {#if !allAgreementsChecked}
              <!-- Summary shown before agreement, payment gated -->
              <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
              <div class="bg-surface-input rounded-lg p-5 mb-4">
                {#each selectedParticipations as p (p.teamId)}
                  {@const selectedPlayersInTeam = p.unpaidPlayers.filter((pl) =>
                    effectiveIds(p).has(pl.steamId),
                  )}
                  {#if selectedPlayersInTeam.length > 0}
                    {#if selectedParticipations.length > 1}
                      <p class="text-text-muted text-xs font-medium uppercase tracking-wider mb-2">
                        {p.teamName}
                      </p>
                    {/if}
                    {#each selectedPlayersInTeam as player (player.steamId)}
                      <div class="flex justify-between items-center mb-2">
                        <span class="text-text-body text-sm">
                          {player.name}
                          {#if player.steamId === data.steamId}
                            <span class="text-text-muted text-xs">(you)</span>
                          {/if}
                          <span class="text-text-muted text-xs ml-1">signup fee</span>
                        </span>
                        <span class="text-white text-sm"
                          >{p.currencySymbol}{player.signupCost.toFixed(2)}</span
                        >
                      </div>
                      {#if player.leagueFees > 0}
                        <div class="flex justify-between items-center mb-2 ml-4">
                          <span class="text-text-muted text-xs">
                            League fee{p.seasonNum != null ? ` (Season ${p.seasonNum})` : ''}
                          </span>
                          <span class="text-text-muted text-xs"
                            >{p.currencySymbol}{player.leagueFees.toFixed(2)}</span
                          >
                        </div>
                      {/if}
                    {/each}
                  {/if}
                {/each}
                <div
                  class="border-t border-border-input pt-3 mt-3 flex justify-between items-center"
                >
                  <span class="text-white font-bold">Total Due</span>
                  <span class="text-xl font-bold text-white">
                    {currencySymbol}{totalPaypalAmount.toFixed(2)}
                  </span>
                </div>
              </div>
              <p class="text-text-muted text-sm text-center">
                Please accept all agreements above to proceed with payment.
              </p>
            {:else if selectedMethod === 'items' && hasItemPayment}
              <!-- Item payment summary -->
              <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
              <div class="bg-surface-input rounded-lg p-5 mb-6">
                {#each selectedParticipations as p (p.teamId)}
                  {@const selectedPlayersInTeam = p.unpaidPlayers.filter((pl) =>
                    effectiveIds(p).has(pl.steamId),
                  )}
                  {#if selectedPlayersInTeam.length > 0 && p.itemPaymentConfig}
                    {#if selectedParticipations.length > 1}
                      <p class="text-text-muted text-xs font-medium uppercase tracking-wider mb-2">
                        {p.teamName}
                      </p>
                    {/if}
                    {#each selectedPlayersInTeam as player (player.steamId)}
                      <div class="flex justify-between items-center mb-2">
                        <span class="text-text-body text-sm">
                          {player.name}
                          {#if player.steamId === data.steamId}
                            <span class="text-text-muted text-xs">(you)</span>
                          {/if}
                        </span>
                        <span class="text-white text-sm font-semibold">
                          {p.itemPaymentConfig.itemQuantity}x {p.itemPaymentConfig.itemName}
                        </span>
                      </div>
                    {/each}
                  {/if}
                {/each}
                <div
                  class="border-t border-border-input pt-3 mt-3 flex justify-between items-center"
                >
                  <span class="text-white font-bold">Total Due</span>
                  <span class="text-xl font-bold text-white">
                    {totalItemsRequired}x {itemName}
                  </span>
                </div>
              </div>

              <ItemPaymentCheckout
                teams={checkoutTeams}
                {itemName}
                {totalItemsRequired}
                botTradeOfferUrl={data.botTradeOfferUrl}
                botProfile={data.botProfile}
                pendingItemOrder={data.pendingItemOrder
                  ? {
                      orderNumber: data.pendingItemOrder.orderNumber,
                      itemName: data.pendingItemOrder.itemName,
                      itemsRequired: data.pendingItemOrder.itemsRequired,
                      expiresAt: data.pendingItemOrder.expiresAt,
                    }
                  : null}
              />
            {:else}
              <!-- PayPal summary -->
              <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
              <div class="bg-surface-input rounded-lg p-5 mb-6">
                {#each selectedParticipations as p (p.teamId)}
                  {@const selectedPlayersInTeam = p.unpaidPlayers.filter((pl) =>
                    effectiveIds(p).has(pl.steamId),
                  )}
                  {#if selectedPlayersInTeam.length > 0}
                    {#if selectedParticipations.length > 1}
                      <p class="text-text-muted text-xs font-medium uppercase tracking-wider mb-2">
                        {p.teamName}
                      </p>
                    {/if}
                    {#each selectedPlayersInTeam as player (player.steamId)}
                      <div class="flex justify-between items-center mb-2">
                        <span class="text-text-body text-sm">
                          {player.name}
                          {#if player.steamId === data.steamId}
                            <span class="text-text-muted text-xs">(you)</span>
                          {/if}
                          <span class="text-text-muted text-xs ml-1">signup fee</span>
                        </span>
                        <span class="text-white text-sm"
                          >{p.currencySymbol}{player.signupCost.toFixed(2)}</span
                        >
                      </div>
                      {#if player.leagueFees > 0}
                        <div class="flex justify-between items-center mb-2 ml-4">
                          <span class="text-text-muted text-xs">
                            League fee{p.seasonNum != null ? ` (Season ${p.seasonNum})` : ''}
                          </span>
                          <span class="text-text-muted text-xs"
                            >{p.currencySymbol}{player.leagueFees.toFixed(2)}</span
                          >
                        </div>
                      {/if}
                    {/each}
                  {/if}
                {/each}
                {#if totalLeagueFees === 0}
                  <div
                    class="border-t border-border-input pt-3 mt-3 flex justify-between items-center"
                  >
                    <span class="text-white font-bold">Total Due</span>
                    <span class="text-xl font-bold text-white">
                      {currencySymbol}{totalPaypalAmount.toFixed(2)}
                    </span>
                  </div>
                {:else}
                  <div
                    class="border-t border-border-input pt-3 mt-1 flex justify-between items-center"
                  >
                    <span class="text-white font-bold">Total Due</span>
                    <span class="text-xl font-bold text-white">
                      {currencySymbol}{totalPaypalAmount.toFixed(2)}
                    </span>
                  </div>
                {/if}
              </div>

              {#if hasPaypal}
                <PaypalCheckout
                  paypalClientId={data.paypalClientId}
                  {currency}
                  totalAmount={totalPaypalAmount}
                  steamId={data.steamId}
                  teams={checkoutTeams}
                  isTestMode={data.isTestMode}
                />
              {/if}
            {/if}
          </div>
        {:else if selectedParticipations.length === 0}
          <div class="p-12 text-center">
            <p class="text-text-muted">Select at least one registration above to continue.</p>
          </div>
        {/if}
      </Card>

      {#if selectedParticipations.length === 1}
        <div class="text-center mt-6">
          <a
            href="/teams/{selectedParticipations[0].teamId}"
            class="text-text-muted hover:text-white transition-colors"
          >
            &larr; Back to Team Page
          </a>
        </div>
      {:else}
        <div class="text-center mt-6">
          <a href="/" class="text-text-muted hover:text-white transition-colors">
            &larr; Back to Home
          </a>
        </div>
      {/if}
    {/if}
  </div>
</div>
