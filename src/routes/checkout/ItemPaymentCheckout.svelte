<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from '#lib/state/toast.svelte.js';
  import Button from '#lib/components/ui/Button.svelte';

  let {
    lineIds,
    itemName,
    totalItemsRequired,
    botTradeOfferUrl,
    botProfile,
    pendingItemOrder,
  }: {
    lineIds: number[];
    itemName: string;
    totalItemsRequired: number;
    botTradeOfferUrl: string | null;
    botProfile: { steamId: string; name: string; avatar: string; profileUrl: string } | null;
    pendingItemOrder: {
      orderNumber: string;
      itemName: string;
      itemsRequired: number;
      expiresAt: string;
    } | null;
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
          window.location.href = '/checkout?payment=success';
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
  <div class="space-y-4">
    {#if botProfile}
      <div class="flex items-center gap-3 rounded-lg bg-surface-input p-4">
        <img src={botProfile.avatar} alt={botProfile.name} class="h-10 w-10 rounded-full" />
        <div>
          <p class="text-xs text-text-body">Items will be sent to</p>
          <a
            href={botProfile.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-primary-ink hover:text-primary-300"
          >
            {botProfile.name}
          </a>
        </div>
      </div>
    {/if}

    <p class="text-sm text-text-body">
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
      <input type="hidden" name="lineIds" value={JSON.stringify(lineIds)} />
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting}
        class="w-full py-4 text-lg font-bold"
      >
        {isSubmitting ? 'Creating Order...' : `Pay with ${totalItemsRequired}x ${itemName}`}
      </Button>
    </form>
  </div>
{:else}
  <div class="space-y-4">
    <div class="rounded-lg bg-surface-input p-6">
      <div class="mb-5 flex items-center justify-between">
        <div>
          <p class="text-xs tracking-wider text-text-body uppercase">Order</p>
          <p class="text-lg font-bold text-text-heading">{order.orderNumber}</p>
        </div>
        <div
          class="rounded-full px-3 py-1.5 text-sm font-medium {isExpired
            ? 'bg-danger-500/20 text-danger-ink'
            : 'bg-warning-500/20 text-warning-ink'}"
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
            class="w-full py-3 text-center font-bold"
          >
            Open Trade Offer Link
          </Button>
        </div>
      {/if}

      {#if botProfile}
        <div class="mb-4 flex items-center gap-3 rounded-lg bg-surface-card p-3">
          <img src={botProfile.avatar} alt={botProfile.name} class="h-8 w-8 rounded-full" />
          <a
            href={botProfile.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm font-medium text-primary-ink hover:text-primary-300"
          >
            {botProfile.name}
          </a>
        </div>
      {/if}

      <div class="rounded-lg border border-info-500/30 bg-info-500/10 p-3">
        <p class="text-sm text-info-ink">
          Send exactly <strong>{order.itemsRequired}x {order.itemName}</strong> to the bot via the trade
          offer link above. This page updates automatically once the trade is accepted.
        </p>
      </div>

      {#if !isExpired}
        <div class="mt-4 flex items-center gap-2 text-sm text-text-body">
          <div
            class="h-4 w-4 animate-spin rounded-full border-t-2 border-b-2 border-primary-500"
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
