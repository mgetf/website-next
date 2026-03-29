<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from '$lib/state/toast.svelte';
  import type { PageData } from './$types';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data }: { data: PageData } = $props();
  let cancellingOrder = $state<string | null>(null);

  const statuses = ['ALL', 'PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const;

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'red' | 'zinc' {
    if (status === 'COMPLETED') return 'green';
    if (status === 'PENDING') return 'yellow';
    if (status === 'EXPIRED') return 'red';
    return 'zinc';
  }

  function getStatusLabel(status: string): string {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'PENDING') return 'Pending';
    if (status === 'EXPIRED') return 'Expired';
    return 'Cancelled';
  }
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Item Payment Orders</h1>
      <p class="text-text-body text-sm mt-1">{data.total} total orders</p>
    </div>
  </div>

  <!-- Status Filter -->
  <div class="flex gap-2 mb-6 flex-wrap">
    {#each statuses as status}
      <a
        href="?status={status}&page=1"
        class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {data.statusFilter ===
        status
          ? 'bg-orange-500/20 text-primary-400 border border-orange-500/30'
          : 'bg-surface-input text-text-body hover:text-white hover:bg-surface-hover border border-border-input'}"
      >
        {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
      </a>
    {/each}
  </div>

  {#if data.orders.length > 0}
    <Card padding="none" class="overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-surface-page/80 text-xs text-text-muted uppercase tracking-wider">
              <th class="text-left px-4 py-3 font-medium">Order</th>
              <th class="text-left px-4 py-3 font-medium">Player</th>
              <th class="text-left px-4 py-3 font-medium">Team</th>
              <th class="text-left px-4 py-3 font-medium">Items</th>
              <th class="text-left px-4 py-3 font-medium">Status</th>
              <th class="text-left px-4 py-3 font-medium">Trade ID</th>
              <th class="text-left px-4 py-3 font-medium">Created</th>
              <th class="text-left px-4 py-3 font-medium">Expires</th>
              <th class="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-default/50">
            {#each data.orders as order (order.id)}
              <tr class="hover:bg-surface-input/30 transition-colors">
                <td class="px-4 py-3">
                  <span class="text-white font-mono text-xs">{order.orderNumber}</span>
                </td>
                <td class="px-4 py-3">
                  <a
                    href="/users/{order.playerSteamId}"
                    class="text-primary-400 hover:text-primary-300 transition-colors text-xs"
                  >
                    {order.playerName}
                  </a>
                </td>
                <td class="px-4 py-3">
                  <a
                    href="/teams/{order.teamId}"
                    class="text-primary-400 hover:text-primary-300 transition-colors text-xs"
                  >
                    {order.teamName}
                  </a>
                </td>
                <td class="px-4 py-3 text-text-label text-xs whitespace-nowrap">
                  {order.itemsReceived}/{order.itemsRequired}
                  {order.itemName}
                </td>
                <td class="px-4 py-3">
                  <Badge color={getStatusBadgeColor(order.status)}>
                    {getStatusLabel(order.status)}
                  </Badge>
                </td>
                <td class="px-4 py-3">
                  {#if order.tradeOfferId}
                    <span class="text-text-body font-mono text-xs">{order.tradeOfferId}</span>
                  {:else}
                    <span class="text-text-muted text-xs">-</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-text-body text-xs whitespace-nowrap">
                  {formatDate(order.createdAt)}
                </td>
                <td class="px-4 py-3 text-text-body text-xs whitespace-nowrap">
                  {formatDate(order.expiresAt)}
                </td>
                <td class="px-4 py-3 text-right">
                  {#if order.status === 'PENDING'}
                    <form
                      method="POST"
                      action="?/cancelOrder"
                      use:enhance={() => {
                        cancellingOrder = order.orderNumber;
                        return async ({ result, update }) => {
                          cancellingOrder = null;
                          if (result.type === 'success') {
                            toast.success(`Order ${order.orderNumber} cancelled`);
                            await update();
                          } else if (result.type === 'failure') {
                            toast.error(
                              (result.data as { error?: string })?.error ||
                                'Failed to cancel order',
                            );
                          }
                        };
                      }}
                    >
                      <input type="hidden" name="orderNumber" value={order.orderNumber} />
                      <Button
                        type="submit"
                        variant="danger"
                        size="sm"
                        disabled={cancellingOrder === order.orderNumber}
                      >
                        {cancellingOrder === order.orderNumber ? 'Cancelling...' : 'Cancel'}
                      </Button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex items-center justify-between mt-6">
        <p class="text-sm text-text-muted">
          Page {data.currentPage} of {data.totalPages}
        </p>
        <div class="flex gap-2">
          {#if data.currentPage > 1}
            <a
              href="?status={data.statusFilter}&page={data.currentPage - 1}"
              class="px-3 py-1.5 bg-surface-input hover:bg-surface-hover text-text-label rounded-lg text-sm transition-colors"
            >
              Previous
            </a>
          {/if}
          {#if data.currentPage < data.totalPages}
            <a
              href="?status={data.statusFilter}&page={data.currentPage + 1}"
              class="px-3 py-1.5 bg-surface-input hover:bg-surface-hover text-text-label rounded-lg text-sm transition-colors"
            >
              Next
            </a>
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <Card padding="none" class="p-12 text-center">
      <p class="text-text-muted">No item payment orders found</p>
    </Card>
  {/if}
</div>
