<script lang="ts">
  import { enhance } from '$app/forms';
  import { toast } from '$lib/state/toast.svelte';
  import type { PageData } from './$types';

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

  function getStatusBadge(status: string): { label: string; classes: string } {
    if (status === 'COMPLETED')
      return { label: 'Completed', classes: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (status === 'PENDING')
      return {
        label: 'Pending',
        classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    if (status === 'EXPIRED')
      return { label: 'Expired', classes: 'bg-red-500/20 text-red-400 border-red-500/30' };
    return {
      label: 'Cancelled',
      classes: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    };
  }
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Item Payment Orders</h1>
      <p class="text-gray-400 text-sm mt-1">{data.total} total orders</p>
    </div>
  </div>

  <!-- Status Filter -->
  <div class="flex gap-2 mb-6 flex-wrap">
    {#each statuses as status}
      <a
        href="?status={status}&page=1"
        class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {data.statusFilter ===
        status
          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
          : 'bg-zinc-800 text-gray-400 hover:text-white hover:bg-zinc-700 border border-zinc-700'}"
      >
        {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
      </a>
    {/each}
  </div>

  {#if data.orders.length > 0}
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-zinc-950/80 text-xs text-gray-500 uppercase tracking-wider">
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
          <tbody class="divide-y divide-zinc-800/50">
            {#each data.orders as order (order.id)}
              {@const badge = getStatusBadge(order.status)}
              <tr class="hover:bg-zinc-800/30 transition-colors">
                <td class="px-4 py-3">
                  <span class="text-white font-mono text-xs">{order.orderNumber}</span>
                </td>
                <td class="px-4 py-3">
                  <a
                    href="/users/{order.playerSteamId}"
                    class="text-orange-400 hover:text-orange-300 transition-colors text-xs"
                  >
                    {order.playerName}
                  </a>
                </td>
                <td class="px-4 py-3">
                  <a
                    href="/teams/{order.teamId}"
                    class="text-orange-400 hover:text-orange-300 transition-colors text-xs"
                  >
                    {order.teamName}
                  </a>
                </td>
                <td class="px-4 py-3 text-gray-300 text-xs whitespace-nowrap">
                  {order.itemsReceived}/{order.itemsRequired}
                  {order.itemName}
                </td>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex px-2 py-0.5 rounded text-xs font-medium border {badge.classes}"
                  >
                    {badge.label}
                  </span>
                </td>
                <td class="px-4 py-3">
                  {#if order.tradeOfferId}
                    <span class="text-gray-400 font-mono text-xs">{order.tradeOfferId}</span>
                  {:else}
                    <span class="text-gray-600 text-xs">-</span>
                  {/if}
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {formatDate(order.createdAt)}
                </td>
                <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
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
                      <button
                        type="submit"
                        disabled={cancellingOrder === order.orderNumber}
                        class="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded border border-red-500/30 transition-colors disabled:opacity-50"
                      >
                        {cancellingOrder === order.orderNumber ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination -->
    {#if data.totalPages > 1}
      <div class="flex items-center justify-between mt-6">
        <p class="text-sm text-gray-500">
          Page {data.currentPage} of {data.totalPages}
        </p>
        <div class="flex gap-2">
          {#if data.currentPage > 1}
            <a
              href="?status={data.statusFilter}&page={data.currentPage - 1}"
              class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Previous
            </a>
          {/if}
          {#if data.currentPage < data.totalPages}
            <a
              href="?status={data.statusFilter}&page={data.currentPage + 1}"
              class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg text-sm transition-colors"
            >
              Next
            </a>
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
      <p class="text-gray-500">No item payment orders found</p>
    </div>
  {/if}
</div>
