<script lang="ts">
  import type { PageData } from './$types';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/ui/DataTable.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

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

  function getStatusBadgeColor(status: string): 'green' | 'blue' | 'yellow' | 'red' | 'zinc' {
    if (status === 'ACTIVE') return 'green';
    if (status === 'READY') return 'blue';
    if (status === 'UNREADY') return 'yellow';
    if (status === 'DISBANDED') return 'red';
    return 'zinc';
  }

  function getStatusLabel(status: string) {
    if (status === 'ACTIVE') return 'Active';
    if (status === 'READY') return 'Ready';
    if (status === 'UNREADY') return 'Not Ready';
    if (status === 'DISBANDED') return 'Disbanded';
    return status;
  }
</script>

<div>
  <PageHero
    title="Teams"
    subtitle="{data.pagination.totalCount.toLocaleString()} teams"
    maxWidth="max-w-7xl"
    border
  />
  <div class="container mx-auto px-4 py-8 max-w-7xl">
    <Card padding="lg" class="mb-6">
      <form onsubmit={handleSearch} class="flex flex-col gap-4">
        <div class="flex flex-col md:flex-row gap-4">
          <div class="flex-1">
            <label for="search" class="block text-sm font-medium text-text-body mb-2">
              Search
            </label>
            <SearchInput bind:value={searchInput} placeholder="Search by team name or acronym..." />
          </div>

          <div class="md:w-48">
            <label for="region" class="block text-sm font-medium text-text-body mb-2">
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
            <label for="season" class="block text-sm font-medium text-text-body mb-2">
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
          <Button type="submit">Search</Button>

          {#if data.filters.search || data.filters.region || data.filters.season}
            <Button type="button" variant="secondary" onclick={clearFilters}>Clear</Button>
          {/if}
        </div>
      </form>
    </Card>

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
              <div class="w-10 h-10 rounded bg-surface-hover flex items-center justify-center">
                <span class="text-lg font-bold text-text-body">
                  {team.acronym
                    ? team.acronym.charAt(0).toUpperCase()
                    : team.name.charAt(0).toUpperCase()}
                </span>
              </div>
            {/if}
            <div>
              <div
                class="text-sm font-medium text-white group-hover:text-primary-400 transition-colors"
              >
                {team.name}
              </div>
              {#if team.acronym}
                <div class="text-xs text-text-muted">{team.acronym}</div>
              {/if}
            </div>
          </a>
        {:else if col.key === 'division'}
          {#if team.division}
            <span class="text-sm text-text-label whitespace-nowrap">{team.division.name}</span>
          {:else}
            <span class="text-sm text-text-muted">—</span>
          {/if}
        {:else if col.key === 'region'}
          {#if team.region}
            <div class="text-sm text-text-label whitespace-nowrap">{team.region.name}</div>
            {#if team.season}
              <div class="text-xs text-text-muted">Season {team.season.seasonNum}</div>
            {/if}
          {:else}
            <span class="text-sm text-text-muted">—</span>
          {/if}
        {:else if col.key === 'record'}
          <div class="text-sm font-medium text-white whitespace-nowrap">
            {team.wins}W - {team.losses}L
          </div>
        {:else if col.key === 'players'}
          <span class="text-sm text-text-label">{team._count.players}</span>
        {:else if col.key === 'status'}
          <Badge color={getStatusBadgeColor(team.status)} class="whitespace-nowrap">
            {getStatusLabel(team.status)}
          </Badge>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</div>
