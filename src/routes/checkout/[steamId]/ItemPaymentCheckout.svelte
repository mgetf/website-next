<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from '$lib/state/toast.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let {
    teamId,
    itemPaymentConfig,
    botTradeOfferUrl,
    botProfile,
    pendingItemOrder,
    paidForSteamIds,
  }: {
    teamId: number;
    itemPaymentConfig: { itemName: string; itemQuantity: number; itemAppId: number };
    botTradeOfferUrl: string | null;
    botProfile: { steamId: string; name: string; avatar: string; profileUrl: string } | null;
    pendingItemOrder: {
      orderNumber: string;
      itemName: string;
      itemsRequired: number;
      expiresAt: string;
    } | null;
    paidForSteamIds: string[];
  } = $props();

  let isSubmitting = $state(false);
  let order: typeof pendingItemOrder = $state(null);
  $effect(() => {
    order = pendingItemOrder;
  });
  let timeLeft = $state('');
  let isExpired = $state(false);
  let pollInterval: ReturnType<typeof setInterval> | undefined;
  let countdownInterval: ReturnType<typeof setInterval> | undefined;

  function updateCountdown() {
    if (!order) return;
    const now = Date.now();
    const expires = new Date(order.expiresAt).getTime();
    const diff = expires - now;

    if (diff <= 0) {
      timeLeft = '0:00';
      isExpired = true;
      stopPolling();
      return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    timeLeft = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  function startPolling() {
    stopPolling();

    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);

    pollInterval = setInterval(async () => {
      if (!order) return;

      try {
        const res = await fetch(`/api/item-payments/${order.orderNumber}/status`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'COMPLETED') {
          stopPolling();
          window.location.href = `/teams/${teamId}?payment=success`;
        } else if (data.status === 'EXPIRED' || data.status === 'CANCELLED') {
          stopPolling();
          order = null;
          toast.error('Order has been ' + data.status.toLowerCase());
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = undefined;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = undefined;
    }
  }

  $effect(() => {
    if (order) {
      startPolling();
    }
    return () => stopPolling();
  });
</script>

{#if !order}
  <!-- Pre-order: show bot info and create button -->
  <div class="space-y-4">
    {#if botProfile}
      <div class="flex items-center gap-3 p-4 bg-surface-input rounded-lg">
        <img src={botProfile.avatar} alt={botProfile.name} class="w-10 h-10 rounded-full" />
        <div>
          <p class="text-text-body text-xs">Items will be sent to</p>
          <a
            href={botProfile.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-400 hover:text-primary-300 font-medium text-sm"
          >
            {botProfile.name}
          </a>
        </div>
      </div>
    {/if}

    <p class="text-text-body text-sm">
      Create an order to get started. You'll have 30 minutes to send the required items via Steam
      trade offer.
    </p>

    <form
      method="POST"
      action="?/createItemOrder"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ result }) => {
          isSubmitting = false;
          if (result.type === 'success') {
            const data = result.data as {
              order?: {
                orderNumber: string;
                itemName: string;
                itemsRequired: number;
                expiresAt: string;
              };
            };
            if (data?.order) {
              order = data.order;
            }
          } else if (result.type === 'failure') {
            toast.error((result.data as { error?: string })?.error || 'Failed to create order');
          }
        };
      }}
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="paidForSteamIds" value={JSON.stringify(paidForSteamIds)} />
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting}
        class="w-full py-4 text-lg font-bold"
      >
        {isSubmitting
          ? 'Creating Order...'
          : `Pay with ${itemPaymentConfig.itemQuantity}x ${itemPaymentConfig.itemName}`}
      </Button>
    </form>
  </div>
{:else}
  <!-- Active order: show trade link, countdown, polling -->
  <div class="space-y-4">
    <div class="bg-surface-input rounded-lg p-6">
      <div class="flex items-center justify-between mb-5">
        <div>
          <p class="text-text-body text-xs uppercase tracking-wider">Order</p>
          <p class="text-white font-bold text-lg">{order.orderNumber}</p>
        </div>
        <div
          class="px-3 py-1.5 rounded-full text-sm font-medium {isExpired
            ? 'bg-danger-500/20 text-danger-400'
            : 'bg-warning-500/20 text-warning-400'}"
        >
          {isExpired ? 'Expired' : timeLeft}
        </div>
      </div>

      {#if botTradeOfferUrl && !isExpired}
        <div class="mb-4">
          <Button
            href={botTradeOfferUrl}
            variant="success"
            target="_blank"
            rel="noopener noreferrer"
            class="w-full py-3 font-bold text-center"
          >
            Open Trade Offer Link
          </Button>
        </div>
      {/if}

      {#if botProfile}
        <div class="flex items-center gap-3 p-3 bg-surface-card rounded-lg mb-4">
          <img src={botProfile.avatar} alt={botProfile.name} class="w-8 h-8 rounded-full" />
          <a
            href={botProfile.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary-400 hover:text-primary-300 text-sm font-medium"
          >
            {botProfile.name}
          </a>
        </div>
      {/if}

      <div class="p-3 bg-info-500/10 border border-info-500/30 rounded-lg">
        <p class="text-info-400 text-sm">
          Send exactly <strong>{order.itemsRequired}x {order.itemName}</strong> to the bot via the trade
          offer link above. This page updates automatically once the trade is accepted.
        </p>
      </div>

      {#if !isExpired}
        <div class="mt-4 flex items-center gap-2 text-text-body text-sm">
          <div
            class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary-500"
          ></div>
          Waiting for trade offer...
        </div>
      {/if}
    </div>

    {#if !isExpired}
      <form
        method="POST"
        action="?/cancelItemOrder"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ result, update }) => {
            isSubmitting = false;
            if (result.type === 'success') {
              order = null;
              toast.success('Order cancelled');
              await update();
            } else if (result.type === 'failure') {
              toast.error((result.data as { error?: string })?.error || 'Failed to cancel order');
            }
          };
        }}
      >
        <input type="hidden" name="orderNumber" value={order.orderNumber} />
        <Button type="submit" variant="secondary" disabled={isSubmitting} class="w-full">
          {isSubmitting ? 'Cancelling...' : 'Cancel Order'}
        </Button>
      </form>
    {/if}
  </div>
{/if}
