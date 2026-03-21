<script lang="ts">
  import type { PageData } from './$types';
  import PaypalCheckout from './PaypalCheckout.svelte';
  import ItemPaymentCheckout from './ItemPaymentCheckout.svelte';

  let { data: pageData }: { data: PageData } = $props();

  const hasPaypal = $derived(!!pageData.paypalClientId || pageData.isTestMode);
  const hasItemPayment = $derived(!!pageData.itemPaymentConfig && !!pageData.botTradeOfferUrl);
  const hasBothMethods = $derived(hasPaypal && hasItemPayment);

  let selectedMethod = $state<'paypal' | 'items'>(
    pageData.pendingItemOrder
      ? 'items'
      : pageData.itemPaymentConfig &&
          pageData.botTradeOfferUrl &&
          !pageData.paypalClientId &&
          !pageData.isTestMode
        ? 'items'
        : 'paypal',
  );
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-2xl mx-auto">
    <div class="mb-8 text-center">
      <h1 class="text-4xl font-bold text-white mb-2">Complete Payment</h1>
      <p class="text-gray-400">Pay your team signup fee to activate your registration</p>
    </div>

    <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <!-- Team Info -->
      <div class="bg-gradient-to-r from-orange-600/20 to-orange-600/5 p-6 border-b border-zinc-800">
        <div class="flex items-center gap-4">
          {#if pageData.team.avatar}
            <img
              src={pageData.team.avatar}
              alt={pageData.team.name}
              class="w-16 h-16 rounded-lg object-cover"
            />
          {:else}
            <div
              class="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
            >
              <span class="text-2xl text-gray-400">{pageData.team.name.charAt(0)}</span>
            </div>
          {/if}
          <div>
            <h2 class="text-xl font-bold text-white">{pageData.team.name}</h2>
            <p class="text-sm text-gray-400">
              {pageData.division.name} &bull; {pageData.team.region?.name || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <!-- Payment Method Selector -->
      {#if hasBothMethods}
        <div class="p-6 border-b border-zinc-800">
          <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
            Payment Method
          </h3>
          <div class="grid grid-cols-2 gap-3">
            <button
              onclick={() => (selectedMethod = 'paypal')}
              class="flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left {selectedMethod ===
              'paypal'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'}"
            >
              <img src="/paypal.svg" alt="PayPal" class="h-8 w-8 shrink-0" />
              <div>
                <p class="text-white font-semibold">PayPal</p>
                <p class="text-gray-400 text-xs mt-0.5">Pay with PayPal or card</p>
              </div>
            </button>
            <button
              onclick={() => (selectedMethod = 'items')}
              class="flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left {selectedMethod ===
              'items'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'}"
            >
              <img src="/steam_logo.png" alt="Steam" class="h-8 w-8 shrink-0 brightness-0 invert" />
              <div>
                <p class="text-white font-semibold">Steam Items</p>
                <p class="text-gray-400 text-xs mt-0.5">
                  Pay with {pageData.itemPaymentConfig?.itemName}
                </p>
              </div>
            </button>
          </div>
        </div>
      {/if}

      <div class="p-8">
        <!-- Payment Summary (adapts to selected method) -->
        {#if selectedMethod === 'items' && hasItemPayment && pageData.itemPaymentConfig}
          <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
          <div class="bg-zinc-800 rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center">
              <span class="text-gray-400">Division Signup Fee</span>
              <span class="text-white font-semibold">
                {pageData.itemPaymentConfig.itemQuantity}x {pageData.itemPaymentConfig.itemName}
              </span>
            </div>
            <div class="border-t border-zinc-700 mt-4 pt-4 flex justify-between items-center">
              <span class="text-white font-bold">Total Due</span>
              <span class="text-2xl font-bold text-white">
                {pageData.itemPaymentConfig.itemQuantity}x {pageData.itemPaymentConfig.itemName}
              </span>
            </div>
          </div>

          <ItemPaymentCheckout
            teamId={pageData.team.id}
            itemPaymentConfig={pageData.itemPaymentConfig}
            botTradeOfferUrl={pageData.botTradeOfferUrl}
            botProfile={pageData.botProfile}
            pendingItemOrder={pageData.pendingItemOrder}
          />
        {:else}
          <h3 class="text-lg font-semibold text-white mb-4">Payment Summary</h3>
          <div class="bg-zinc-800 rounded-lg p-6 mb-6">
            <div class="flex justify-between items-center mb-3">
              <span class="text-gray-400">Division Signup Fee</span>
              <span class="text-white font-semibold">
                {pageData.currencySymbol}{pageData.signupCost.toFixed(2)}
              </span>
            </div>
            {#if pageData.leagueFees > 0}
              <div class="flex justify-between items-center mb-3">
                <span class="text-gray-400">League Fees</span>
                <span class="text-white font-semibold">
                  {pageData.currencySymbol}{pageData.leagueFees.toFixed(2)}
                </span>
              </div>
            {/if}
            {#if pageData.amountPaid > 0}
              <div class="flex justify-between items-center mb-3">
                <span class="text-gray-400">Already Paid</span>
                <span class="text-green-400 font-semibold">
                  -{pageData.currencySymbol}{pageData.amountPaid.toFixed(2)}
                </span>
              </div>
            {/if}
            <div class="border-t border-zinc-700 pt-4 flex justify-between items-center">
              <span class="text-white font-bold">Total Due</span>
              <span class="text-2xl font-bold text-white">
                {pageData.currencySymbol}{pageData.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {#if hasPaypal}
            <PaypalCheckout
              paypalClientId={pageData.paypalClientId}
              currency={pageData.currency}
              totalAmount={pageData.totalAmount}
              steamId={pageData.steamId}
              teamId={pageData.team.id}
              isTestMode={pageData.isTestMode}
            />
          {/if}
        {/if}
      </div>
    </div>

    <div class="text-center mt-6">
      <a href="/teams/{pageData.team.id}" class="text-gray-400 hover:text-white transition-colors">
        &larr; Back to Team Page
      </a>
    </div>
  </div>
</div>
