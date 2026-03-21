<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getMethodBadge(method: string): { label: string; classes: string } {
    if (method === 'paypal')
      return { label: 'PayPal', classes: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    if (method === 'items')
      return {
        label: 'Steam Items',
        classes: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      };
    return { label: 'Manual', classes: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
  }

  function getStatusBadge(status: string): { label: string; classes: string } {
    if (status === 'completed')
      return { label: 'Completed', classes: 'bg-green-500/20 text-green-400 border-green-500/30' };
    if (status === 'pending')
      return {
        label: 'Pending',
        classes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      };
    if (status === 'expired')
      return { label: 'Expired', classes: 'bg-red-500/20 text-red-400 border-red-500/30' };
    return {
      label: 'Cancelled',
      classes: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    };
  }

  function formatAmount(entry: (typeof data.entries)[0]): string {
    if (entry.currency === 'ITEMS') return entry.description;
    if (entry.currency === 'MANUAL') return 'Manual';
    const symbol = entry.currency === 'EUR' ? '€' : '$';
    return `${symbol}${parseFloat(entry.amount).toFixed(2)} ${entry.currency}`;
  }
</script>

<svelte:head>
  <title>Payment History - MGE.tf</title>
</svelte:head>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
  <div class="max-w-4xl mx-auto">
    <div class="mb-8">
      <a
        href="/users/{data.steamId}"
        class="text-gray-400 hover:text-white transition-colors text-sm"
      >
        &larr; Back to Profile
      </a>
      <h1 class="text-3xl font-bold text-white mt-3">Payment History</h1>
      <p class="text-gray-400 mt-1">All your payments across PayPal and Steam item trades</p>
    </div>

    {#if data.entries.length > 0}
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <!-- Desktop table -->
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-zinc-950/80 text-xs text-gray-500 uppercase tracking-wider">
                <th class="text-left px-5 py-3 font-medium">ID</th>
                <th class="text-left px-5 py-3 font-medium">Date</th>
                <th class="text-left px-5 py-3 font-medium">Method</th>
                <th class="text-left px-5 py-3 font-medium">Amount</th>
                <th class="text-left px-5 py-3 font-medium">Team</th>
                <th class="text-left px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-800/50">
              {#each data.entries as entry (entry.id)}
                {@const method = getMethodBadge(entry.method)}
                {@const status = getStatusBadge(entry.status)}
                <tr class="hover:bg-zinc-800/30 transition-colors">
                  <td class="px-5 py-3.5">
                    <span class="text-gray-300 font-mono text-xs">{entry.id}</span>
                  </td>
                  <td class="px-5 py-3.5 text-gray-400 whitespace-nowrap">
                    {formatDate(entry.date)}
                  </td>
                  <td class="px-5 py-3.5">
                    <span
                      class="inline-flex px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap {method.classes}"
                    >
                      {method.label}
                    </span>
                  </td>
                  <td class="px-5 py-3.5 text-white font-medium whitespace-nowrap">
                    {formatAmount(entry)}
                  </td>
                  <td class="px-5 py-3.5">
                    {#if entry.teamId}
                      <a
                        href="/teams/{entry.teamId}"
                        class="text-orange-400 hover:text-orange-300 transition-colors"
                      >
                        {entry.teamName}
                      </a>
                    {:else}
                      <span class="text-gray-600">-</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3.5">
                    <span
                      class="inline-flex px-2 py-0.5 rounded text-xs font-medium border {status.classes}"
                    >
                      {status.label}
                    </span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Mobile cards -->
        <div class="md:hidden divide-y divide-zinc-800/50">
          {#each data.entries as entry (entry.id)}
            {@const method = getMethodBadge(entry.method)}
            {@const status = getStatusBadge(entry.status)}
            <div class="p-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-gray-300 font-mono text-xs">{entry.id}</span>
                <span
                  class="inline-flex px-2 py-0.5 rounded text-xs font-medium border {status.classes}"
                >
                  {status.label}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-white font-medium">{formatAmount(entry)}</span>
                <span
                  class="inline-flex px-2 py-0.5 rounded text-xs font-medium border {method.classes}"
                >
                  {method.label}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{formatDate(entry.date)}</span>
                {#if entry.teamId}
                  <a
                    href="/teams/{entry.teamId}"
                    class="text-orange-400 hover:text-orange-300 transition-colors"
                  >
                    {entry.teamName}
                  </a>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Pagination -->
      {#if data.totalPages > 1}
        <div class="flex items-center justify-between mt-6">
          <p class="text-sm text-gray-500">
            Page {data.currentPage} of {data.totalPages} ({data.total} total)
          </p>
          <div class="flex gap-2">
            {#if data.currentPage > 1}
              <a
                href="?page={data.currentPage - 1}"
                class="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Previous
              </a>
            {/if}
            {#if data.currentPage < data.totalPages}
              <a
                href="?page={data.currentPage + 1}"
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
        <p class="text-gray-500">No payment history found</p>
      </div>
    {/if}
  </div>
</div>
