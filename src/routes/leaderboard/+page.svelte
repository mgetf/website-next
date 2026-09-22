<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import FilterBar from '$lib/components/ui/FilterBar.svelte';
  import MultiSelectMenu from '$lib/components/ui/MultiSelectMenu.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import { TF_CLASSES_DISPLAY_ORDER, tfClassById } from '$lib/constants/tfClasses';
  import { classIcon } from '$lib/utils/classIcons';
  import { formatRd, PROVISIONAL_RATING_TITLE, ratingValue, RD_TOOLTIP } from '$lib/utils/rating';
  import { flagForRegion } from '$lib/utils/regions';

  let { data } = $props();

  let selectedRegions = $state<string[]>([]);
  let registeredOnly = $state(false);
  let search = $state('');
  let pageSize = $state('50');
  let selectedClass = $state('');

  $effect(() => {
    selectedRegions = data.filters.regions;
    registeredOnly = data.filters.registeredOnly;
    search = data.filters.search;
    pageSize = String(data.filters.pageSize);
    selectedClass = data.filters.classId != null ? String(data.filters.classId) : '';
  });

  const sortBy = $derived<string>(data.filters.sortBy);
  const sortDir = $derived<'asc' | 'desc'>(data.filters.sortDir);

  const regionItems = $derived(
    data.regions.map((region) => ({
      value: region.code,
      label: region.code.toUpperCase(),
    })),
  );

  const pageSizeOptions = [
    { value: '25', label: '25' },
    { value: '50', label: '50' },
    { value: '100', label: '100' },
  ];

  const classOptions = TF_CLASSES_DISPLAY_ORDER.map((cls) => ({
    value: String(cls.id),
    label: cls.label,
  }));

  function classOptionIcon(value: string): string | null {
    return classIcon(tfClassById(Number(value))?.name);
  }

  const selectedClassInfo = $derived(
    data.filters.classId != null ? tfClassById(data.filters.classId) : null,
  );
  const selectedClassIcon = $derived(selectedClassInfo ? classIcon(selectedClassInfo.name) : null);
  const heroSubtitle = $derived(
    selectedClassInfo
      ? `${selectedClassInfo.label} rating standings from all active regions`
      : 'Global rating standings from all active regions',
  );

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

  function regionParam(selected: string[]): string | null {
    if (selected.length === 0) return null;
    const codes = data.regions.map((region) => region.code);
    if (selected.length === codes.length && codes.every((code) => selected.includes(code))) {
      return null;
    }
    return selected.join(',');
  }

  function applyFilters(overrides: Record<string, string | number | boolean | null> = {}) {
    const params = new URLSearchParams(page.url.searchParams);
    const merged: Record<string, string | number | boolean | null> = {
      region: regionParam(selectedRegions),
      registeredOnly: registeredOnly ? '1' : null,
      search: data.filters.search || null,
      page: 1,
      pageSize: data.filters.pageSize === 50 ? null : data.filters.pageSize,
      sortBy: data.filters.sortBy === 'elo' ? null : data.filters.sortBy,
      sortDir: data.filters.sortDir === 'desc' ? null : data.filters.sortDir,
      class: data.filters.classId,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v == null || v === '' || v === false) params.delete(k);
      else params.set(k, String(v));
    }
    goto(resolve('/leaderboard') + `?${params}`);
  }

  function changePage(p: number) {
    const params = new URLSearchParams(page.url.searchParams);
    params.set('page', String(p));
    goto(resolve('/leaderboard') + `?${params}`);
  }

  function handleSort(key: string) {
    const sortKey = key === 'lastActive' ? 'lastPlayed' : key;
    const newDir: 'asc' | 'desc' = sortBy === sortKey && sortDir === 'desc' ? 'asc' : 'desc';
    const params = new URLSearchParams(page.url.searchParams);
    params.set('sortBy', sortKey);
    params.set('sortDir', newDir);
    params.set('page', '1');
    if (sortKey === 'elo') params.delete('sortBy');
    if (newDir === 'desc') params.delete('sortDir');
    goto(resolve('/leaderboard') + `?${params}`);
  }

  const hasActiveFilters = $derived(
    data.filters.registeredOnly ||
      !!data.filters.search ||
      data.filters.regions.length > 0 ||
      data.filters.classId != null,
  );
  const tableSortBy = $derived(
    data.filters.sortBy === 'lastPlayed' ? 'lastActive' : data.filters.sortBy,
  );

  const emptyMessage = $derived(
    data.filters.search ? 'No players match your search.' : 'No players found.',
  );

  function commitSearch() {
    applyFilters({ search: search.trim() || null, page: 1 });
  }

  function clearFilters() {
    selectedRegions = [];
    registeredOnly = false;
    search = '';
    selectedClass = '';
    applyFilters({
      region: null,
      registeredOnly: null,
      search: null,
      class: null,
      page: 1,
    });
  }

  const columns = $derived<Column[]>([
    { key: 'rank', label: '#', width: '60px' },
    { key: 'region', label: 'Region', width: '90px' },
    { key: 'player', label: 'Player' },
    { key: 'elo', label: 'Rating', align: 'right', width: '80px', sortable: true },
    {
      key: 'rd',
      label: 'RD',
      align: 'right',
      width: '70px',
      sortable: true,
      headerTooltip: RD_TOOLTIP,
    },
    { key: 'games', label: 'Games', align: 'center', width: '70px', sortable: true },
    { key: 'wins', label: 'W', align: 'center', width: '50px', sortable: true },
    { key: 'losses', label: 'L', align: 'center', width: '50px', sortable: true },
    { key: 'winrate', label: 'W/L %', align: 'center', width: '70px', sortable: true },
    {
      key: 'lastActive',
      label: 'Last Active',
      align: 'right',
      width: '110px',
      sortable: true,
    },
  ]);
</script>

<PageHero title="Rankings" subtitle={heroSubtitle} maxWidth="max-w-7xl" border={true} />

<div class="max-w-7xl mx-auto px-6 pt-6">
  <FilterBar onSubmit={commitSearch} onClear={clearFilters} {hasActiveFilters}>
    {#snippet filters()}
      <div class="md:w-56">
        <label for="leaderboard-regions" class="block text-sm font-medium text-text-body mb-2"
          >Region</label
        >
        <MultiSelectMenu
          id="leaderboard-regions"
          bind:value={selectedRegions}
          items={regionItems}
          placeholder="All regions"
          overflowNoun="regions"
          size="sm"
          onOpenChange={(open) => {
            if (open) return;
            const next = regionParam(selectedRegions);
            const current = page.url.searchParams.get('region');
            if ((next ?? '') === (current ?? '')) return;
            applyFilters({ region: next, page: 1 });
          }}
        >
          {#snippet itemPrefix(item)}
            <FlagIcon code={flagForRegion(item.value, data.regions)} class="w-5 h-3.5 rounded-sm" />
          {/snippet}
        </MultiSelectMenu>
      </div>

      <div class="md:w-48">
        <label for="leaderboard-class" class="block text-sm font-medium text-text-body mb-2"
          >Class</label
        >
        <SelectFilter
          id="leaderboard-class"
          bind:value={selectedClass}
          options={classOptions}
          allLabel="Overall"
          onChange={(v) => applyFilters({ class: v || null, page: 1 })}
        >
          {#snippet itemPrefix(item)}
            {@const icon = classOptionIcon(item.value)}
            {#if icon}
              <img src={icon} alt="" class="size-5 shrink-0" />
            {/if}
          {/snippet}
        </SelectFilter>
      </div>

      <div class="flex-1 min-w-48">
        <label for="leaderboard-search" class="block text-sm font-medium text-text-body mb-2"
          >Search</label
        >
        <SearchInput
          id="leaderboard-search"
          bind:value={search}
          placeholder="Search by name or Steam ID…"
        />
      </div>

      <div class="md:w-28">
        <label for="leaderboard-page-size" class="block text-sm font-medium text-text-body mb-2"
          >Per page</label
        >
        <SelectFilter
          id="leaderboard-page-size"
          bind:value={pageSize}
          options={pageSizeOptions}
          allLabel="50"
          showAllOption={false}
          onChange={(v) => applyFilters({ pageSize: v === '50' ? null : v, page: 1 })}
        />
      </div>

      <label
        for="leaderboard-registered"
        class="flex items-center gap-2 cursor-pointer select-none pb-2"
      >
        <input
          id="leaderboard-registered"
          type="checkbox"
          bind:checked={registeredOnly}
          onchange={() => applyFilters({ registeredOnly: registeredOnly ? '1' : null })}
          class="w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
        />
        <span class="text-sm text-text-label">Registered players only</span>
      </label>
    {/snippet}
  </FilterBar>
</div>

{#if data.filters.search}
  <div class="max-w-7xl mx-auto px-6 -mt-2 pb-2">
    <p class="text-xs text-text-muted">
      Showing results for "<span class="text-white">{data.filters.search}</span>"
    </p>
  </div>
{/if}

<div class="max-w-7xl mx-auto px-6 pb-16">
  <h2 class="mb-6 flex items-center gap-3 text-5xl font-black text-white">
    {#if selectedClassInfo}
      {#if selectedClassIcon}
        <img src={selectedClassIcon} alt="" class="size-12 shrink-0" />
      {/if}
      {selectedClassInfo.label}
    {:else}
      Overall
    {/if}
  </h2>
  <DataTable
    data={data.entries}
    {columns}
    {emptyMessage}
    sortBy={tableSortBy}
    sortDir={data.filters.sortDir}
    onSort={handleSort}
    pagination={{
      currentPage: data.filters.page,
      totalPages: data.totalPages,
      onPageChange: changePage,
      infoText: `${data.total.toLocaleString()} players`,
    }}
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
              href={resolve('/users/[steamId]', { steamId: row.steamId64 })}
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
      {:else if col.key === 'rd'}
        <span class="tabular-nums text-text-muted text-sm">{formatRd(row.rd)}</span>
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
