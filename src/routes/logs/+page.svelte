<script lang="ts">
  import { goto } from '$app/navigation';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { classIcon } from '$lib/utils/classIcons';
  import { cleanArenaName } from '$lib/utils/arenaNames';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const filterPlayer = $derived(data.filterPlayer);

  const columns: Column[] = [
    { key: 'match', label: 'Match' },
    { key: 'map', label: 'Map', width: '180px' },
    { key: 'format', label: 'Format', align: 'center', width: '80px' },
    { key: 'date', label: 'Date', align: 'right', width: '130px' },
  ];

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    );
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
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (filterPlayer) params.set('player', filterPlayer.steamId);
    goto(`?${params.toString()}`);
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
  {#if filterPlayer}
    <div
      class="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-lg bg-surface-card border border-border-default"
    >
      <span class="text-sm text-text-body">
        Showing logs for
        <a
          href="/users/{filterPlayer.steamId}"
          class="font-semibold text-white hover:text-primary-400 transition-colors"
        >
          {filterPlayer.name ?? filterPlayer.steamId}
        </a>
      </span>
      <Button variant="ghost" size="sm" href="/logs">Clear filter</Button>
    </div>
  {/if}
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
        {#if log.preview}
          <a href="/logs/{log.id}" class="flex items-center gap-2 sm:gap-3 min-w-0 group py-0.5">
            <!-- Winner: icons → name → score -->
            <div class="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
              <div class="flex items-center gap-0.5 shrink-0">
                {#each log.preview.winner.classes as cls, i (i)}
                  {@const icon = classIcon(cls)}
                  {#if icon}
                    <img src={icon} alt={cls} title={cls} class="w-5 h-5 shrink-0" />
                  {/if}
                {/each}
              </div>
              <span
                class="text-white text-sm font-bold truncate group-hover:text-primary-400 transition-colors"
              >
                {log.preview.winner.names.join(' & ')}
              </span>
              <span class="text-white font-black text-base tabular-nums shrink-0">
                {log.preview.winner.score}
              </span>
            </div>

            <!-- Center divider -->
            <span class="text-text-muted text-sm shrink-0 select-none" aria-hidden="true">—</span>

            <!-- Loser: score ← name ← icons -->
            <div class="flex items-center gap-1.5 min-w-0 flex-1 justify-start">
              <span class="text-text-muted font-black text-base tabular-nums shrink-0">
                {log.preview.loser.score}
              </span>
              <span class="text-text-label text-sm font-bold truncate">
                {log.preview.loser.names.join(' & ')}
              </span>
              <div class="flex items-center gap-0.5 shrink-0 opacity-80">
                {#each log.preview.loser.classes as cls, i (i)}
                  {@const icon = classIcon(cls)}
                  {#if icon}
                    <img src={icon} alt={cls} title={cls} class="w-5 h-5 shrink-0" />
                  {/if}
                {/each}
              </div>
            </div>
          </a>
        {:else}
          <a
            href="/logs/{log.id}"
            class="text-text-muted text-sm hover:text-white transition-colors italic"
          >
            {log.aborted ? 'Aborted match' : `Match #${log.mgeMatchId}`}
          </a>
        {/if}
      {:else if col.key === 'map'}
        {@const arenaName = cleanArenaName(log.arena)}
        <div class="min-w-0">
          <span class="text-text-body text-sm truncate block">{log.map}</span>
          {#if arenaName}
            <p class="text-text-muted text-xs mt-0.5 truncate">{arenaName}</p>
          {/if}
        </div>
      {:else if col.key === 'format'}
        <Badge color={log.format === '1v1' ? 'purple' : 'blue'}>{log.format}</Badge>
      {:else if col.key === 'date'}
        <span class="text-text-muted text-sm whitespace-nowrap">{formatDate(log.startedAt)}</span>
      {/if}
    {/snippet}
  </DataTable>
</div>
