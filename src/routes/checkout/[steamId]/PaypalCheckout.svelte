<script lang="ts">
  import { onMount, tick } from 'svelte';

  let {
    paypalClientId,
    currency,
    totalAmount,
    steamId,
    teamId,
    isTestMode,
    paidForSteamIds,
  }: {
    paypalClientId: string;
    currency: string;
    totalAmount: number;
    steamId: string;
    teamId: number;
    isTestMode: boolean;
    paidForSteamIds: string[];
  } = $props();

  let paypalLoaded = $state(false);
  let buttonsInitialized = $state(false);
  let isProcessing = $state(false);
  let errorMessage = $state<string | null>(null);

  onMount(() => {
    if (isTestMode) {
      paypalLoaded = true;
      return;
    }

    if (!paypalClientId || paypalClientId.length < 10) {
      errorMessage = 'PayPal is not configured. Please contact support.';
      return;
    }

    if ((window as any).paypal && (window as any).__paypalCurrency === currency) {
      paypalLoaded = true;
      return;
    }

    if ((window as any).paypal) {
      delete (window as any).paypal;
      buttonsInitialized = false;
      const oldScript = document.querySelector('script[src*="paypal.com/sdk/js"]');
      oldScript?.remove();
    }

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=${currency}`;
    script.async = true;
    script.onload = () => {
      (window as any).__paypalCurrency = currency;
      paypalLoaded = true;
    };
    script.onerror = () => {
      errorMessage = 'Failed to load PayPal. Please check your internet connection and refresh.';
    };
    document.body.appendChild(script);
  });

  $effect(() => {
    if (paypalLoaded && !buttonsInitialized && !isTestMode) {
      tick().then(() => {
        initPayPalButtons();
      });
    }
  });

  async function processTestPayment() {
    isProcessing = true;
    errorMessage = null;

    try {
      const createResponse = await fetch('/api/paypal/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: totalAmount, currency, steamId, teamId, paidForSteamIds }),
      });

      const order = await createResponse.json();
      if (!createResponse.ok || order.error) {
        throw new Error(order.error || 'Failed to create test order');
      }

      const captureResponse = await fetch('/api/paypal/capture-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderID: order.id,
          steamId,
          teamId,
          amount: totalAmount,
          currency,
          paidForSteamIds,
        }),
      });

      const result = await captureResponse.json();
      if (result.success) {
        window.location.href = `/teams/${result.teamId || teamId}?payment=success`;
      } else {
        errorMessage = result.error || 'Test payment failed.';
        isProcessing = false;
      }
    } catch (err: any) {
      errorMessage = err.message || 'Test payment failed.';
      isProcessing = false;
    }
  }

  function initPayPalButtons() {
    if (buttonsInitialized) return;

    if (!(window as any).paypal) {
      errorMessage = 'PayPal failed to initialize. Please refresh the page.';
      return;
    }

    const container = document.getElementById('paypal-button-container');
    if (!container) {
      setTimeout(() => initPayPalButtons(), 100);
      return;
    }

    buttonsInitialized = true;
    container.innerHTML = '';

    try {
      (window as any).paypal
        .Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
          createOrder: async () => {
            try {
              errorMessage = null;
              const response = await fetch('/api/paypal/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  amount: totalAmount,
                  currency,
                  steamId,
                  teamId,
                  paidForSteamIds,
                }),
              });
              const order = await response.json();
              if (!response.ok || order.error) {
                throw new Error(order.error || 'Failed to create order');
              }
              return order.id;
            } catch (err: any) {
              errorMessage = err.message || 'Failed to create payment order. Please try again.';
              throw err;
            }
          },
          onApprove: async (paypalData: { orderID: string }) => {
            isProcessing = true;
            errorMessage = null;
            try {
              const response = await fetch('/api/paypal/capture-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderID: paypalData.orderID,
                  steamId,
                  teamId,
                  amount: totalAmount,
                  currency,
                  paidForSteamIds,
                }),
              });
              const result = await response.json();
              if (result.success) {
                window.location.href = `/teams/${result.teamId || teamId}?payment=success`;
              } else {
                errorMessage = result.error || 'Payment failed. Please contact support.';
                isProcessing = false;
              }
            } catch {
              errorMessage = 'Failed to complete payment. Please contact support.';
              isProcessing = false;
            }
          },
          onCancel: () => {},
          onError: () => {
            const container = document.getElementById('paypal-button-container');
            if (container && container.children.length === 0) {
              errorMessage = 'PayPal configuration error. Please contact support.';
            } else {
              errorMessage = 'An error occurred during payment. Please try again.';
            }
            isProcessing = false;
          },
        })
        .render('#paypal-button-container')
        .catch(() => {
          buttonsInitialized = false;
          errorMessage =
            'Failed to display PayPal buttons. Please refresh or try a different browser.';
        });
    } catch {
      errorMessage = 'Failed to initialize PayPal. Please refresh the page.';
    }
  }
</script>

{#if errorMessage}
  <div class="mb-4 p-4 bg-danger-500/20 border border-danger-500/50 rounded-lg">
    <p class="text-danger-400">{errorMessage}</p>
  </div>
{/if}

{#if isProcessing}
  <div class="text-center py-8">
    <div
      class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"
    ></div>
    <p class="text-text-body">Processing payment...</p>
  </div>
{:else if isTestMode}
  <div class="space-y-4">
    <div class="p-4 bg-warning-500/10 border border-warning-500/30 rounded-lg">
      <p class="text-warning-400 text-sm font-medium">
        TEST MODE - No real payment will be processed
      </p>
    </div>
    <button
      onclick={processTestPayment}
      class="w-full py-4 bg-warning-500 hover:bg-warning-400 text-black font-bold rounded-lg transition-colors text-lg"
    >
      Complete Test Payment
    </button>
  </div>
{:else if !paypalLoaded}
  <div class="text-center py-8">
    <div
      class="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mb-4"
    ></div>
    <p class="text-text-body">Loading payment options...</p>
  </div>
{:else}
  <div id="paypal-button-container"></div>
{/if}

{#if isTestMode}
  <div class="mt-6 p-4 bg-info-500/10 border border-info-500/30 rounded-lg">
    <p class="text-info-400 text-sm">
      <strong>Test Mode:</strong> This is a simulated payment for development. No real charges will be
      made.
    </p>
  </div>
{:else}
  <div class="mt-6 p-4 bg-info-500/10 border border-info-500/30 rounded-lg">
    <p class="text-info-400 text-sm">
      <strong>Note:</strong> Payment is processed securely through PayPal. Once payment is confirmed,
      your team registration will be activated.
    </p>
  </div>
{/if}
