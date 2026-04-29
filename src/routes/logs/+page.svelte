<script lang="ts">
  import { goto } from '$app/navigation';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const columns: Column[] = [
    { key: 'match', label: 'Match' },
    { key: 'map', label: 'Map', width: '180px' },
    { key: 'format', label: 'Format', align: 'center', width: '80px' },
    { key: 'date', label: 'Date', align: 'right', width: '130px' },
  ];

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  const perPage = $derived(
    data.pagination.totalPages > 0
      ? Math.ceil(data.pagination.total / data.pagination.totalPages)
      : data.logs.length,
  );
  const startItem = $derived((data.pagination.page - 1) * perPage + 1);
  const endItem = $derived(startItem + data.logs.length - 1);
  const infoText = $derived(`Showing ${startItem} to ${endItem} of ${data.pagination.total} logs`);

  function goToPage(page: number) {
    goto(`?page=${page}`);
  }
</script>

<svelte:head>
  <title>Match Logs — MGE.TF</title>
</svelte:head>

<PageHero
  title="Match Logs"
  subtitle="Browse recent MGE match logs from official servers."
  border={true}
/>

<div class="max-w-7xl mx-auto px-4 py-8">
  <DataTable
    data={data.logs}
    {columns}
    compact={true}
    emptyMessage="No match logs have been uploaded yet."
    pagination={{
      currentPage: data.pagination.page,
      totalPages: data.pagination.totalPages,
      onPageChange: goToPage,
      infoText,
    }}
  >
    {#snippet cell(log, col)}
      {#if col.key === 'match'}
        <div>
          <a
            href="/logs/{log.id}"
            class="text-white text-sm font-medium hover:text-primary-400 transition-colors"
          >
            {log.hostname ?? 'Unknown'} —
            {#if log.players.length >= 2}
              {log.players[0]} vs {log.players[1]}
            {:else if log.players.length === 1}
              {log.players[0]}
            {:else}
              #{log.mgeMatchId}
            {/if}
          </a>
        </div>
      {:else if col.key === 'map'}
        <div class="min-w-0">
          <span class="text-text-body text-sm truncate block">{log.map}</span>
          {#if log.arena}
            <p class="text-text-muted text-xs mt-0.5 truncate">{log.arena}</p>
          {/if}
        </div>
      {:else if col.key === 'format'}
        <Badge color={log.format === '1v1' ? 'blue' : 'green'}>{log.format}</Badge>
      {:else if col.key === 'date'}
        <span class="text-text-muted text-sm whitespace-nowrap">{formatDate(log.startedAt)}</span>
      {/if}
    {/snippet}
  </DataTable>
</div>
