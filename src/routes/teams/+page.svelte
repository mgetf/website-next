<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';

  let { data }: { data: PageData } = $props();

  let searchInput = $state('');
  let regionFilter = $state('');
  let seasonFilter = $state('');

  $effect(() => {
    searchInput = data.filters.search;
    regionFilter = data.filters.region?.toString() || '';
    seasonFilter = data.filters.season?.toString() || '';
  });

  const regionOptions = $derived(
    data.regions.map((r) => ({ value: r.id.toString(), label: r.name })),
  );

  const filteredSeasons = $derived(
    regionFilter
      ? data.seasons.filter((s) => s.regionId.toString() === regionFilter)
      : data.seasons,
  );

  const seasonOptions = $derived(
    filteredSeasons.map((s) => ({
      value: s.id.toString(),
      label: regionFilter
        ? `Season ${s.seasonNum}`
        : `${s.region?.name || 'Unknown'} - Season ${s.seasonNum}`,
    })),
  );

  const columns = [
    { key: 'team', label: 'Team' },
    { key: 'division', label: 'Division' },
    { key: 'region', label: 'Region / Season' },
    { key: 'record', label: 'Record' },
    { key: 'players', label: 'Players' },
    { key: 'status', label: 'Status' },
  ];

  const paginationInfo = $derived(
    `Showing ${(data.pagination.currentPage - 1) * data.pagination.perPage + 1} to ${Math.min(data.pagination.currentPage * data.pagination.perPage, data.pagination.totalCount)} of ${data.pagination.totalCount} teams`,
  );

  function handleSearch(event: Event) {
    event.preventDefault();
    updateFilters();
  }

  function handleRegionChange() {
    if (regionFilter && seasonFilter) {
      const seasonStillValid = data.seasons.some(
        (s) => s.id.toString() === seasonFilter && s.regionId.toString() === regionFilter,
      );
      if (!seasonStillValid) {
        seasonFilter = '';
      }
    }
    updateFilters();
  }

  function handleSeasonChange() {
    updateFilters();
  }

  function updateFilters() {
    const params = new URLSearchParams();

    if (searchInput) {
      params.set('search', searchInput);
    }

    if (regionFilter) {
      params.set('region', regionFilter);
    }

    if (seasonFilter) {
      params.set('season', seasonFilter);
    }

    params.set('page', '1');

    goto(`/teams?${params.toString()}`, { replaceState: true });
  }

  function changePage(page: number) {
    const params = new URLSearchParams();

    if (data.filters.search) {
      params.set('search', data.filters.search);
    }

    if (data.filters.region) {
      params.set('region', data.filters.region.toString());
    }

    if (data.filters.season) {
      params.set('season', data.filters.season.toString());
    }

    params.set('page', page.toString());

    goto(`/teams?${params.toString()}`);
  }

  function clearFilters() {
    searchInput = '';
    regionFilter = '';
    seasonFilter = '';
    goto('/teams');
  }

  function getStatusBadge(status: string) {
    if (status === 'ACTIVE') return 'bg-green-500/20 text-green-300 border border-green-500/30';
    if (status === 'READY') return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
    if (status === 'UNREADY') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
    if (status === 'DISBANDED') return 'bg-red-500/20 text-red-300 border border-red-500/30';
    return 'bg-zinc-800 text-gray-400 border border-zinc-700';
  }

  function getStatusLabel(status: string) {
    if (status === 'ACTIVE') return 'Active';
    if (status === 'READY') return 'Ready';
    if (status === 'UNREADY') return 'Not Ready';
    if (status === 'DISBANDED') return 'Disbanded';
    return status;
  }
</script>

<svelte:head>
  <title>Teams - MGE.tf</title>
  <meta name="description" content="Browse all MGE.tf teams" />
</svelte:head>

<div>
  <PageHero
    title="Teams"
    subtitle="{data.pagination.totalCount.toLocaleString()} teams"
    maxWidth="max-w-7xl"
    border
  />
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <!-- Filters -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
      <form onsubmit={handleSearch} class="flex flex-col gap-4">
        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex-1">
            <label for="search" class="block text-sm font-medium text-gray-400 mb-2">
              Search
            </label>
            <SearchInput bind:value={searchInput} placeholder="Search by team name or acronym..." />
          </div>

          <div class="md:w-48">
            <label for="region" class="block text-sm font-medium text-gray-400 mb-2">
              Region
            </label>
            <SelectFilter
              bind:value={regionFilter}
              options={regionOptions}
              allLabel="All Regions"
              onChange={handleRegionChange}
            />
          </div>

          <div class="md:w-48">
            <label for="season" class="block text-sm font-medium text-gray-400 mb-2">
              Season
            </label>
            <SelectFilter
              bind:value={seasonFilter}
              options={seasonOptions}
              allLabel="All Seasons"
              onChange={handleSeasonChange}
            />
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="submit"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
          >
            Search
          </button>

          {#if data.filters.search || data.filters.region || data.filters.season}
            <button
              type="button"
              onclick={clearFilters}
              class="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
            >
              Clear
            </button>
          {/if}
        </div>
      </form>
    </div>

    <!-- Teams Table -->
    <DataTable
      data={data.teams}
      {columns}
      emptyMessage="No Teams Found"
      emptyIcon="👥"
      pagination={{
        currentPage: data.pagination.currentPage,
        totalPages: data.pagination.totalPages,
        onPageChange: changePage,
        infoText: paginationInfo,
      }}
    >
      {#snippet cell(team, col)}
        {#if col.key === 'team'}
          <a href="/teams/{team.id}" class="flex items-center space-x-3 group whitespace-nowrap">
            {#if team.avatar}
              <img src={team.avatar} alt={team.name} class="w-10 h-10 rounded" />
            {:else}
              <div class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center">
                <span class="text-lg font-bold text-gray-400">
                  {team.acronym
                    ? team.acronym.charAt(0).toUpperCase()
                    : team.name.charAt(0).toUpperCase()}
                </span>
              </div>
            {/if}
            <div>
              <div
                class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors"
              >
                {team.name}
              </div>
              {#if team.acronym}
                <div class="text-xs text-gray-500">{team.acronym}</div>
              {/if}
            </div>
          </a>
        {:else if col.key === 'division'}
          {#if team.division}
            <span class="text-sm text-gray-300 whitespace-nowrap">{team.division.name}</span>
          {:else}
            <span class="text-sm text-gray-500">—</span>
          {/if}
        {:else if col.key === 'region'}
          {#if team.region}
            <div class="text-sm text-gray-300 whitespace-nowrap">{team.region.name}</div>
            {#if team.season}
              <div class="text-xs text-gray-500">Season {team.season.seasonNum}</div>
            {/if}
          {:else}
            <span class="text-sm text-gray-500">—</span>
          {/if}
        {:else if col.key === 'record'}
          <div class="text-sm font-medium text-white whitespace-nowrap">
            {team.wins}W - {team.losses}L
          </div>
        {:else if col.key === 'players'}
          <span class="text-sm text-gray-300">{team._count.players}</span>
        {:else if col.key === 'status'}
          <span
            class="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap {getStatusBadge(
              team.status,
            )}"
          >
            {getStatusLabel(team.status)}
          </span>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>
