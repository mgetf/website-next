<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { PROVISIONAL_RATING_TITLE, ratingValue } from '$lib/utils/rating';
  import { flagForRegion } from '$lib/utils/regions';

  let { data } = $props();

  let selectedRegions = $state<string[]>([]);
  let registeredOnly = $state(false);
  let search = $state('');

  $effect(() => {
    selectedRegions = data.filters.regions;
    registeredOnly = data.filters.registeredOnly;
    search = data.filters.search;
  });

  const sortBy = $derived<string>(data.filters.sortBy);
  const sortDir = $derived<'asc' | 'desc'>(data.filters.sortDir);

  function formatRelativeTime(isoString: string | null): string {
    if (!isoString) return '—';
    const diff = Date.now() - new Date(isoString).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
  }

  function winRate(wins: number | null, losses: number | null): string {
    if (wins == null || losses == null) return '—';
    const total = wins + losses;
    if (total === 0) return '—';
    return `${((wins / total) * 100).toFixed(1)}%`;
  }

  function applyFilters(overrides: Record<string, string | number | boolean | null> = {}) {
    const params = new URLSearchParams();
    const merged: Record<string, string | number | boolean | null> = {
      region: selectedRegions.join(','),
      registeredOnly: registeredOnly ? '1' : null,
      search: data.filters.search || null,
      page: 1,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '' && v !== false) params.set(k, String(v));
    }
    goto(`?${params}`);
  }

  function changePage(p: number) {
    const params = new URLSearchParams(page.url.searchParams);
    params.set('page', String(p));
    goto(`?${params}`);
  }

  function handleSort(key: string) {
    const sortKey = key === 'lastActive' ? 'lastPlayed' : key;
    const newDir: 'asc' | 'desc' = sortBy === sortKey && sortDir === 'desc' ? 'asc' : 'desc';
    const params = new URLSearchParams(page.url.searchParams);
    params.set('sortBy', sortKey);
    params.set('sortDir', newDir);
    params.set('page', '1');
    goto(`?${params}`);
  }

  const hasActiveFilters = $derived(registeredOnly || !!data.filters.search);
  const tableSortBy = $derived(
    data.filters.sortBy === 'lastPlayed' ? 'lastActive' : data.filters.sortBy,
  );

  const emptyMessage = $derived(
    data.filters.search ? 'No players match your search.' : 'No players found.',
  );

  function commitSearch() {
    const params = new URLSearchParams();
    params.set('region', selectedRegions.join(','));
    if (search.trim()) params.set('search', search.trim());
    goto(`?${params}`);
  }

  function toggleRegion(r: string) {
    if (selectedRegions.includes(r)) {
      if (selectedRegions.length === 1) return;
      applyFilters({ region: selectedRegions.filter((x) => x !== r).join(','), page: 1 });
    } else {
      applyFilters({ region: [...selectedRegions, r].join(','), page: 1 });
    }
  }

  const showRegionCol = $derived(data.filters.regions.length > 1);

  const columns = $derived<Column[]>([
    { key: 'rank', label: '#', width: '60px' },
    ...(showRegionCol ? [{ key: 'region', label: 'Region', width: '90px' } as Column] : []),
    { key: 'player', label: 'Player' },
    { key: 'elo', label: 'Rating', align: 'right' as const, width: '80px', sortable: true },
    { key: 'games', label: 'Games', align: 'center' as const, width: '70px', sortable: true },
    { key: 'wins', label: 'W', align: 'center' as const, width: '50px', sortable: true },
    { key: 'losses', label: 'L', align: 'center' as const, width: '50px', sortable: true },
    { key: 'winrate', label: 'W/L %', align: 'center' as const, width: '70px', sortable: true },
    {
      key: 'lastActive',
      label: 'Last Active',
      align: 'right' as const,
      width: '110px',
      sortable: true,
    },
  ]);
</script>

<PageHero
  title="Rankings"
  subtitle="Global rating standings from all active regions"
  maxWidth="max-w-7xl"
  border={true}
/>

<!-- Filters -->
<div class="max-w-7xl mx-auto px-6 pt-6 pb-4">
  <Card>
    <div class="flex flex-col gap-4">
      <!-- Region selector -->
      <div class="flex gap-1 flex-wrap">
        {#each data.regions as region (region.code)}
          {@const fc = flagForRegion(region.code, data.regions)}
          {@const isActive = selectedRegions.includes(region.code)}
          <button
            type="button"
            onclick={() => toggleRegion(region.code)}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors {isActive
              ? 'bg-primary-600 text-white'
              : 'bg-surface-input text-text-label hover:bg-surface-hover hover:text-white'}"
          >
            <FlagIcon code={fc} class="w-5 h-3.5 rounded-sm" />
            {region.code.toUpperCase()}
          </button>
        {/each}
      </div>

      <!-- Search row -->
      <div class="flex gap-2">
        <div class="relative flex-1">
          <svg
            class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search by name or Steam ID…"
            bind:value={search}
            onkeydown={(e) => e.key === 'Enter' && commitSearch()}
            class="w-full rounded-lg border border-border-input bg-surface-input pl-9 pr-4 py-2 text-sm text-white placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <Button variant="primary" size="sm" onclick={commitSearch}>Search</Button>
      </div>

      {#if data.filters.search}
        <p class="text-xs text-text-muted">
          Showing results for "<span class="text-white">{data.filters.search}</span>"
        </p>
      {/if}

      <!-- Options row -->
      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={registeredOnly}
            onchange={() => applyFilters({ registeredOnly: registeredOnly ? '1' : null })}
            class="w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
          />
          <span class="text-sm text-text-label">Registered players only</span>
        </label>

        {#if hasActiveFilters}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => {
              registeredOnly = false;
              search = '';
              applyFilters({ registeredOnly: null, search: null, page: 1 });
            }}
          >
            Clear filters
          </Button>
        {/if}
      </div>
    </div>
  </Card>
</div>

<!-- Table -->
<div class="max-w-7xl mx-auto px-6 pb-16">
  <DataTable
    data={data.entries}
    {columns}
    {emptyMessage}
    sortBy={tableSortBy}
    sortDir={data.filters.sortDir}
    onSort={handleSort}
    pagination={data.totalPages > 1
      ? {
          currentPage: data.filters.page,
          totalPages: data.totalPages,
          onPageChange: changePage,
          infoText: `${data.total.toLocaleString()} players`,
        }
      : undefined}
  >
    {#snippet cell(row, col)}
      {#if col.key === 'rank'}
        <span class="font-mono text-sm {row.rank <= 3 ? 'font-black' : 'text-text-muted'}">
          #{row.rank}
        </span>
      {:else if col.key === 'region'}
        {@const fc = flagForRegion(row.region, data.regions)}
        <div class="flex items-center gap-1.5">
          <FlagIcon code={fc} class="w-5 h-3.5 rounded-sm shrink-0" />
          <span class="text-sm font-medium text-text-label uppercase">{row.region}</span>
        </div>
      {:else if col.key === 'player'}
        <div class="flex items-center gap-2.5 min-w-0">
          {#if row.avatar}
            <img
              src={row.avatar}
              alt={row.name ?? 'Player'}
              class="w-7 h-7 rounded-full shrink-0"
            />
          {:else}
            <div
              class="w-7 h-7 rounded-full bg-surface-input shrink-0 flex items-center justify-center"
            >
              <svg
                class="w-4 h-4 text-text-muted"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                />
              </svg>
            </div>
          {/if}
          {#if row.isRegistered && row.name}
            <a
              href="/users/{row.steamId64}"
              class="font-medium text-white hover:text-primary-400 transition-colors truncate"
            >
              {row.name}
            </a>
          {:else}
            <a
              href="https://steamcommunity.com/profiles/{row.steamId64}"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-text-label hover:text-primary-400 transition-colors truncate"
              >{row.name ?? 'Unknown Player'}</a
            >
          {/if}
        </div>
      {:else if col.key === 'elo'}
        <span
          class="font-black tabular-nums text-primary-400"
          title={row.provisional ? PROVISIONAL_RATING_TITLE : undefined}
        >
          {ratingValue(row.elo)}{#if row.provisional}<span class="text-text-muted">?</span>{/if}
        </span>
      {:else if col.key === 'games'}
        <span class="tabular-nums text-white text-sm">
          {#if row.wins != null || row.losses != null}
            {(row.wins ?? 0) + (row.losses ?? 0)}
          {:else}
            —
          {/if}
        </span>
      {:else if col.key === 'wins'}
        <span class="tabular-nums text-success-400 text-sm">{row.wins ?? '—'}</span>
      {:else if col.key === 'losses'}
        <span class="tabular-nums text-danger-400 text-sm">{row.losses ?? '—'}</span>
      {:else if col.key === 'winrate'}
        <span class="tabular-nums text-text-body text-sm">{winRate(row.wins, row.losses)}</span>
      {:else if col.key === 'lastActive'}
        <span class="text-text-muted text-sm">{formatRelativeTime(row.lastPlayed)}</span>
      {/if}
    {/snippet}
  </DataTable>
</div>
