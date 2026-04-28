<script lang="ts">
  import { goto } from '$app/navigation';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const columns: Column[] = [
    { key: 'id', label: '#', align: 'left', width: '80px' },
    { key: 'match', label: 'Match' },
    { key: 'arena', label: 'Arena' },
    { key: 'format', label: 'Format', align: 'center' },
    { key: 'status', label: 'Status', align: 'center' },
    { key: 'date', label: 'Date' },
    { key: 'duration', label: 'Duration', align: 'right' },
  ];

  function formatDuration(sec: number | null): string {
    if (sec === null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
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

<div class="max-w-7xl mx-auto px-4 py-8">
  <div class="mb-6">
    <h1 class="text-3xl font-bold text-white mb-2">Match Logs</h1>
    <p class="text-text-body">Browse recent MGE match logs from official servers.</p>
  </div>

  <DataTable
    data={data.logs}
    {columns}
    emptyMessage="No match logs have been uploaded yet."
    pagination={{
      currentPage: data.pagination.page,
      totalPages: data.pagination.totalPages,
      onPageChange: goToPage,
      infoText,
    }}
  >
    {#snippet cell(log, col)}
      {#if col.key === 'id'}
        <span class="text-text-muted font-mono text-sm">#{log.id}</span>
      {:else if col.key === 'match'}
        <div>
          <a
            href="/logs/{log.id}"
            class="text-white font-medium hover:text-primary-400 transition-colors"
          >
            {log.hostname ?? 'Unknown'} — #{log.mgeMatchId}
          </a>
          <p class="text-text-muted text-sm mt-0.5">{log.map}</p>
        </div>
      {:else if col.key === 'arena'}
        <span class="text-text-body">{log.arena ?? '—'}</span>
      {:else if col.key === 'format'}
        <Badge color={log.format === '1v1' ? 'blue' : 'green'}>{log.format}</Badge>
      {:else if col.key === 'status'}
        {#if log.aborted}
          <Badge color="red">Aborted</Badge>
        {:else}
          <Badge color="green">Completed</Badge>
        {/if}
      {:else if col.key === 'date'}
        <span class="text-text-body">{formatDate(log.startedAt)}</span>
      {:else if col.key === 'duration'}
        <span class="text-text-body text-right">{formatDuration(log.durationSec)}</span>
      {/if}
    {/snippet}
  </DataTable>
</div>
