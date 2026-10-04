<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import Badge from '$lib/components/ui/Badge.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type { ProfilePaymentEntry } from '$lib/types/profile';

  let {
    steamId,
    entries,
    total,
    currentPage,
    totalPages,
  }: {
    steamId: string;
    entries: ProfilePaymentEntry[];
    total: number;
    currentPage: number;
    totalPages: number;
  } = $props();

  const columns: Column[] = [
    { key: 'id', label: 'ID' },
    { key: 'date', label: 'Date' },
    { key: 'method', label: 'Method' },
    { key: 'amount', label: 'Amount' },
    { key: 'team', label: 'Team' },
    { key: 'status', label: 'Status' },
  ];

  const profilePath = $derived(resolve('/users/[steamId]', { steamId }));

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function methodColor(method: ProfilePaymentEntry['method']): 'blue' | 'orange' | 'zinc' {
    if (method === 'paypal') return 'blue';
    if (method === 'items') return 'orange';
    return 'zinc';
  }

  function methodLabel(method: ProfilePaymentEntry['method']): string {
    if (method === 'paypal') return 'PayPal';
    if (method === 'items') return 'Steam Items';
    return 'Manual';
  }

  function statusColor(status: ProfilePaymentEntry['status']): 'green' | 'yellow' | 'red' | 'zinc' {
    if (status === 'completed') return 'green';
    if (status === 'pending') return 'yellow';
    if (status === 'expired') return 'red';
    return 'zinc';
  }

  function statusLabel(status: ProfilePaymentEntry['status']): string {
    if (status === 'completed') return 'Completed';
    if (status === 'pending') return 'Pending';
    if (status === 'expired') return 'Expired';
    return 'Cancelled';
  }

  function formatAmount(entry: ProfilePaymentEntry): string {
    if (entry.currency === 'ITEMS') return entry.description;
    if (entry.currency === 'MANUAL') return 'Manual';
    const symbol = entry.currency === 'EUR' ? '€' : '$';
    return `${symbol}${parseFloat(entry.amount).toFixed(2)} ${entry.currency}`;
  }

  function goToPage(next: number) {
    const params = new URLSearchParams(page.url.searchParams);
    params.set('tab', 'payments');
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const search = params.toString();
    void goto(search ? `${profilePath}?${search}` : profilePath, {
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<div class="flex flex-col gap-4">
  <p class="text-sm text-text-body">PayPal charges, Steam item trades, and manual marks.</p>

  <DataTable
    data={entries}
    {columns}
    emptyMessage="No payment history found"
    pagination={totalPages > 1
      ? {
          currentPage,
          totalPages,
          onPageChange: goToPage,
          infoText: `Page ${currentPage} of ${totalPages} (${total} total)`,
        }
      : undefined}
  >
    {#snippet cell(entry, col)}
      {#if col.key === 'id'}
        <span class="font-mono text-xs text-text-label">{entry.id}</span>
      {:else if col.key === 'date'}
        <span class="whitespace-nowrap text-text-body">{formatDate(entry.date)}</span>
      {:else if col.key === 'method'}
        <Badge color={methodColor(entry.method)} class="whitespace-nowrap">
          {methodLabel(entry.method)}
        </Badge>
      {:else if col.key === 'amount'}
        <span class="font-medium whitespace-nowrap text-white">{formatAmount(entry)}</span>
      {:else if col.key === 'team'}
        {#if entry.teamId}
          <a
            href={resolve('/teams/[id]', { id: String(entry.teamId) })}
            class="text-primary-400 transition-colors hover:text-primary-300"
          >
            {entry.teamName}
          </a>
        {:else}
          <span class="text-text-muted">-</span>
        {/if}
      {:else if col.key === 'status'}
        <Badge color={statusColor(entry.status)} class="whitespace-nowrap">
          {statusLabel(entry.status)}
        </Badge>
      {/if}
    {/snippet}
  </DataTable>
</div>
