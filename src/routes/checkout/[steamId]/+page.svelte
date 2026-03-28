<script lang="ts">
  import type { PageData } from './$types';
  import PaypalCheckout from './PaypalCheckout.svelte';
  import ItemPaymentCheckout from './ItemPaymentCheckout.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data: pageData }: { data: PageData } = $props();

  const hasPaypal = $derived(!!pageData.paypalClientId || pageData.isTestMode);
  const hasItemPayment = $derived(!!pageData.itemPaymentConfig && !!pageData.botTradeOfferUrl);
  const hasBothMethods = $derived(hasPaypal && hasItemPayment);

  let selectedMethod = $state<'paypal' | 'items'>('paypal');
  let selectedSteamIds = $state<Set<string>>(new Set());

  $effect(() => {
    selectedMethod = pageData.pendingItemOrder
      ? 'items'
      : pageData.itemPaymentConfig &&
          pageData.botTradeOfferUrl &&
          !pageData.paypalClientId &&
          !pageData.isTestMode
        ? 'items'
        : 'paypal';
  });

  $effect(() => {
    if (!pageData.allPaid) {
      const selfUnpaid = pageData.unpaidPlayers.filter(
        (p: { steamId: string }) => p.steamId === pageData.steamId,
      );
      if (selfUnpaid.length > 0) {
        selectedSteamIds = new Set(selfUnpaid.map((p: { steamId: string }) => p.steamId));
      } else {
        selectedSteamIds = new Set(
          pageData.unpaidPlayers.map((p: { steamId: string }) => p.steamId),
        );
      }
    }
  });

  interface CheckoutPlayer {
    steamId: string;
    name: string;
    avatar: string | null;
    signupCost: number;
    leagueFees: number;
    totalCost: number;
  }

  const selectedPlayers = $derived(
    ((pageData.unpaidPlayers ?? []) as CheckoutPlayer[]).filter((p) =>
      selectedSteamIds.has(p.steamId),
    ),
  );

  const totalPaypal = $derived(
    selectedPlayers.reduce((sum: number, p: CheckoutPlayer) => sum + p.totalCost, 0),
  );

  const totalItemQuantity = $derived(
    pageData.itemPaymentConfig
      ? pageData.itemPaymentConfig.itemQuantity * selectedPlayers.length
      : 0,
  );

  const paidForSteamIds = $derived([...selectedSteamIds]);

  function togglePlayer(steamId: string) {
    const next = new Set(selectedSteamIds);
    if (next.has(steamId)) {
      next.delete(steamId);
    } else {
      next.add(steamId);
    }
    selectedSteamIds = next;
  }
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-2xl mx-auto">
    <div class="mb-8 text-center">
      <h1 class="text-4xl font-bold text-white mb-2">Complete Payment</h1>
      <p class="text-text-muted">Pay your team signup fee to activate your registration</p>
    </div>

    {#if pageData.allPaid}
      <!-- All Paid State -->
      <Card padding="none" class="overflow-hidden">
        <div class="p-12 text-center">
          <div
            class="w-16 h-16 rounded-full bg-success-600/20 flex items-center justify-center mx-auto mb-6"
          >
            <svg
              class="w-8 h-8 text-success-400"
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
          <h2 class="text-2xl font-bold text-white mb-2">All Payments Complete</h2>
          <p class="text-text-muted mb-8">
            All team members have paid their signup fees. Nothing pending.
          </p>
          <Button href="/teams/{pageData.team.id}" variant="primary" size="lg">
            Back to Team Page
          </Button>
        </div>
      </Card>
    {:else}
      <Card padding="none" class="overflow-hidden">
        <!-- Team & Registration Info -->
        <div class="p-6 border-b border-border-default">
          <div class="flex items-center gap-4">
            {#if pageData.team.avatar}
              <img
                src={pageData.team.avatar}
                alt={pageData.team.name}
                class="w-12 h-12 rounded-lg object-cover"
              />
            {:else}
              <div
                class="w-12 h-12 rounded-lg bg-surface-input border border-border-input flex items-center justify-center"
              >
                <span class="text-lg text-text-muted">{pageData.team.name.charAt(0)}</span>
              </div>
            {/if}
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-white">{pageData.team.name}</h2>
              <p class="text-sm mt-0.5">
                <span class="text-text-body font-medium">{pageData.format.name}</span>
                {#if pageData.region}
                  <span class="mx-1 text-text-muted">&middot;</span>
                  <span class="text-text-body font-medium">{pageData.region.name}</span>
                {/if}
                <span class="mx-1 text-text-muted">&middot;</span>
                <span class="text-text-body font-medium">{pageData.division.name}</span>
                {#if pageData.season}
                  <span class="mx-1 text-text-muted">&middot;</span>
                  <span class="text-text-body font-medium">Season {pageData.season.seasonNum}</span>
                {/if}
              </p>
            </div>
          </div>
        </div>

        <!-- Player Selection -->
        {#if pageData.unpaidPlayers.length > 0}
          <div class="p-6 border-b border-border-default">
            <h3 class="text-sm font-medium text-text-muted uppercase tracking-wider mb-3">
              Select Players to Pay For
            </h3>
            <div class="space-y-2">
              {#each pageData.unpaidPlayers as player (player.steamId)}
                <label
                  for="player-{player.steamId}"
                  class="flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer {selectedSteamIds.has(
                    player.steamId,
                  )
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border-default bg-surface-card hover:border-border-input'}"
                >
                  <input
                    type="checkbox"
                    id="player-{player.steamId}"
                    checked={selectedSteamIds.has(player.steamId)}
                    onchange={() => togglePlayer(player.steamId)}
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
                      {#if player.steamId === pageData.steamId}
                        <span class="text-text-muted text-xs">(you)</span>
                      {/if}
                    </p>
                  </div>
                  <span class="text-white font-semibold text-sm whitespace-nowrap">
                    {pageData.currencySymbol}{player.totalCost.toFixed(2)}
                  </span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Payment Method Selector -->
        {#if hasBothMethods && selectedPlayers.length > 0}
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
                  <p class="text-text-muted text-xs mt-0.5">
                    Pay with {pageData.itemPaymentConfig?.itemName}
                  </p>
                </div>
              </button>
            </div>
          </div>
        {/if}

        <div class="p-8">
          {#if selectedPlayers.length === 0}
            <div class="text-center py-8">
              <p class="text-text-muted">Select at least one player to continue with payment.</p>
            </div>
          {:else if selectedMethod === 'items' && hasItemPayment && pageData.itemPaymentConfig}
            <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
            <div class="bg-surface-input rounded-lg p-6 mb-6">
              {#each selectedPlayers as player (player.steamId)}
                <div
                  class="flex justify-between items-center {selectedPlayers.length > 1
                    ? 'mb-3'
                    : ''}"
                >
                  <span class="text-text-body">
                    {player.name}
                    {#if player.steamId === pageData.steamId}
                      <span class="text-text-muted text-xs">(you)</span>
                    {/if}
                  </span>
                  <span class="text-white font-semibold">
                    {pageData.itemPaymentConfig.itemQuantity}x {pageData.itemPaymentConfig.itemName}
                  </span>
                </div>
              {/each}
              <div class="border-t border-border-input mt-4 pt-4 flex justify-between items-center">
                <span class="text-white font-bold">Total Due</span>
                <span class="text-2xl font-bold text-white">
                  {totalItemQuantity}x {pageData.itemPaymentConfig.itemName}
                </span>
              </div>
            </div>

            <ItemPaymentCheckout
              teamId={pageData.team.id}
              itemPaymentConfig={{ ...pageData.itemPaymentConfig, itemQuantity: totalItemQuantity }}
              botTradeOfferUrl={pageData.botTradeOfferUrl}
              botProfile={pageData.botProfile}
              pendingItemOrder={pageData.pendingItemOrder}
              {paidForSteamIds}
            />
          {:else}
            <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
            <div class="bg-surface-input rounded-lg p-6 mb-6">
              {#each selectedPlayers as player (player.steamId)}
                <div class="flex justify-between items-center mb-3">
                  <span class="text-text-body">
                    {player.name}
                    {#if player.steamId === pageData.steamId}
                      <span class="text-text-muted text-xs">(you)</span>
                    {/if}
                  </span>
                  <span class="text-white font-semibold">
                    {pageData.currencySymbol}{player.totalCost.toFixed(2)}
                    {#if player.leagueFees > 0}
                      <span class="text-text-muted text-xs ml-1">(incl. league fees)</span>
                    {/if}
                  </span>
                </div>
              {/each}
              <div class="border-t border-border-input pt-4 flex justify-between items-center">
                <span class="text-white font-bold">Total Due</span>
                <span class="text-2xl font-bold text-white">
                  {pageData.currencySymbol}{totalPaypal.toFixed(2)}
                </span>
              </div>
            </div>

            {#if hasPaypal}
              <PaypalCheckout
                paypalClientId={pageData.paypalClientId}
                currency={pageData.currency}
                totalAmount={totalPaypal}
                steamId={pageData.steamId}
                teamId={pageData.team.id}
                isTestMode={pageData.isTestMode}
                {paidForSteamIds}
              />
            {/if}
          {/if}
        </div>
      </Card>

      <div class="text-center mt-6">
        <a
          href="/teams/{pageData.team.id}"
          class="text-text-muted hover:text-white transition-colors"
        >
          &larr; Back to Team Page
        </a>
      </div>
    {/if}
  </div>
</div>
