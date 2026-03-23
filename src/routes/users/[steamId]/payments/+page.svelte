<script lang="ts">
  import type { PageData } from './$types';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

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

  function getMethodBadgeColor(method: string): 'blue' | 'orange' | 'zinc' {
    if (method === 'paypal') return 'blue';
    if (method === 'items') return 'orange';
    return 'zinc';
  }

  function getMethodLabel(method: string): string {
    if (method === 'paypal') return 'PayPal';
    if (method === 'items') return 'Steam Items';
    return 'Manual';
  }

  function getStatusBadgeColor(status: string): 'green' | 'yellow' | 'red' | 'zinc' {
    if (status === 'completed') return 'green';
    if (status === 'pending') return 'yellow';
    if (status === 'expired') return 'red';
    return 'zinc';
  }

  function getStatusLabel(status: string): string {
    if (status === 'completed') return 'Completed';
    if (status === 'pending') return 'Pending';
    if (status === 'expired') return 'Expired';
    return 'Cancelled';
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
        class="text-text-body hover:text-white transition-colors text-sm"
      >
        &larr; Back to Profile
      </a>
      <h1 class="text-3xl font-bold text-white mt-3">Payment History</h1>
      <p class="text-text-body mt-1">All your payments across PayPal and Steam item trades</p>
    </div>

    {#if data.entries.length > 0}
      <Card padding="none" class="overflow-hidden">
        <div class="hidden md:block overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="bg-surface-page/80 text-xs text-text-muted uppercase tracking-wider">
                <th class="text-left px-5 py-3 font-medium">ID</th>
                <th class="text-left px-5 py-3 font-medium">Date</th>
                <th class="text-left px-5 py-3 font-medium">Method</th>
                <th class="text-left px-5 py-3 font-medium">Amount</th>
                <th class="text-left px-5 py-3 font-medium">Team</th>
                <th class="text-left px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-default/50">
              {#each data.entries as entry (entry.id)}
                <tr class="hover:bg-surface-hover/30 transition-colors">
                  <td class="px-5 py-3.5">
                    <span class="text-text-label font-mono text-xs">{entry.id}</span>
                  </td>
                  <td class="px-5 py-3.5 text-text-body whitespace-nowrap">
                    {formatDate(entry.date)}
                  </td>
                  <td class="px-5 py-3.5">
                    <Badge color={getMethodBadgeColor(entry.method)} class="whitespace-nowrap">
                      {getMethodLabel(entry.method)}
                    </Badge>
                  </td>
                  <td class="px-5 py-3.5 text-white font-medium whitespace-nowrap">
                    {formatAmount(entry)}
                  </td>
                  <td class="px-5 py-3.5">
                    {#if entry.teamId}
                      <a
                        href="/teams/{entry.teamId}"
                        class="text-primary-400 hover:text-primary-300 transition-colors"
                      >
                        {entry.teamName}
                      </a>
                    {:else}
                      <span class="text-text-muted">-</span>
                    {/if}
                  </td>
                  <td class="px-5 py-3.5">
                    <Badge color={getStatusBadgeColor(entry.status)} class="whitespace-nowrap">
                      {getStatusLabel(entry.status)}
                    </Badge>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="md:hidden divide-y divide-border-default/50">
          {#each data.entries as entry (entry.id)}
            <div class="p-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-text-label font-mono text-xs">{entry.id}</span>
                <Badge color={getStatusBadgeColor(entry.status)}>
                  {getStatusLabel(entry.status)}
                </Badge>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-white font-medium">{formatAmount(entry)}</span>
                <Badge color={getMethodBadgeColor(entry.method)}>
                  {getMethodLabel(entry.method)}
                </Badge>
              </div>
              <div class="flex items-center justify-between text-xs text-text-muted">
                <span>{formatDate(entry.date)}</span>
                {#if entry.teamId}
                  <a
                    href="/teams/{entry.teamId}"
                    class="text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    {entry.teamName}
                  </a>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </Card>

      {#if data.totalPages > 1}
        <div class="flex items-center justify-between mt-6">
          <p class="text-sm text-text-muted">
            Page {data.currentPage} of {data.totalPages} ({data.total} total)
          </p>
          <div class="flex gap-2">
            {#if data.currentPage > 1}
              <Button href="?page={data.currentPage - 1}" variant="secondary" size="sm">
                Previous
              </Button>
            {/if}
            {#if data.currentPage < data.totalPages}
              <Button href="?page={data.currentPage + 1}" variant="secondary" size="sm">
                Next
              </Button>
            {/if}
          </div>
        </div>
      {/if}
    {:else}
      <Card padding="lg" class="text-center">
        <p class="text-text-muted">No payment history found</p>
      </Card>
    {/if}
  </div>
</div>
