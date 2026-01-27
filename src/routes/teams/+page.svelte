<script lang="ts">
import type { PageData } from './$types';
import { goto } from '$app/navigation';

let { data }: { data: PageData } = $props();

let searchInput = $state(data.filters.search);
let regionFilter = $state(data.filters.region);
let seasonFilter = $state(data.filters.season);

function handleSearch(event: Event) {
  event.preventDefault();
  updateFilters();
}

function handleFilterChange() {
  updateFilters();
}

function updateFilters() {
  const params = new URLSearchParams();

  if (searchInput) {
    params.set('search', searchInput);
  }

  if (regionFilter) {
    params.set('region', regionFilter.toString());
  }

  if (seasonFilter) {
    params.set('season', seasonFilter.toString());
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
  if (status === 'ACTIVE')
    return 'bg-green-500/20 text-green-300 border border-green-500/30';
  if (status === 'READY')
    return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  if (status === 'UNREADY')
    return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30';
  if (status === 'DISBANDED')
    return 'bg-red-500/20 text-red-300 border border-red-500/30';
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

<div class="container mx-auto px-4 py-8 max-w-7xl">
	<!-- Page Header -->
	<div class="mb-8">
		<h1 class="text-4xl font-bold text-white mb-2">Teams</h1>
		<p class="text-gray-400 text-lg">
			{data.pagination.totalCount.toLocaleString()} teams
		</p>
	</div>

	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
		<form onsubmit={handleSearch} class="flex flex-col gap-4">
			<div class="flex flex-col md:flex-row gap-4">
				<div class="flex-1">
					<label for="search" class="block text-sm font-medium text-gray-400 mb-2">
						Search
					</label>
					<input
						type="text"
						id="search"
						bind:value={searchInput}
						placeholder="Search by team name or acronym..."
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
				</div>
				
				<div class="md:w-48">
					<label for="region" class="block text-sm font-medium text-gray-400 mb-2">
						Region
					</label>
					<select
						id="region"
						bind:value={regionFilter}
						onchange={handleFilterChange}
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All Regions</option>
						{#each data.regions as region}
							<option value={region.id}>{region.name}</option>
						{/each}
					</select>
				</div>
				
				<div class="md:w-48">
					<label for="season" class="block text-sm font-medium text-gray-400 mb-2">
						Season
					</label>
					<select
						id="season"
						bind:value={seasonFilter}
						onchange={handleFilterChange}
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All Seasons</option>
						{#each data.seasons as season}
							<option value={season.id}>
								{season.region?.name || 'Unknown'} - Season {season.seasonNum}
							</option>
						{/each}
					</select>
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
	{#if data.teams.length === 0}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
			<div class="text-6xl mb-4">👥</div>
			<h3 class="text-xl font-bold text-white mb-2">No Teams Found</h3>
			<p class="text-gray-400">Try adjusting your search filters</p>
		</div>
	{:else}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-zinc-800">
					<thead class="bg-zinc-800/50">
						<tr>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Team
							</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Division
							</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Region / Season
							</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Record
							</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Players
							</th>
							<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
								Status
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each data.teams as team}
							<tr class="hover:bg-zinc-800/30 transition-colors">
								<td class="px-6 py-3 whitespace-nowrap">
									<a href="/teams/{team.id}" class="flex items-center space-x-3 group">
										{#if team.avatar}
											<img 
												src={team.avatar} 
												alt={team.name}
												class="w-10 h-10 rounded"
											/>
										{:else}
											<div class="w-10 h-10 rounded bg-zinc-700 flex items-center justify-center">
												<span class="text-lg font-bold text-gray-400">
													{team.acronym ? team.acronym.charAt(0).toUpperCase() : team.name.charAt(0).toUpperCase()}
												</span>
											</div>
										{/if}
										<div>
											<div class="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
												{team.name}
											</div>
											{#if team.acronym}
												<div class="text-xs text-gray-500">{team.acronym}</div>
											{/if}
										</div>
									</a>
								</td>
								<td class="px-6 py-3 whitespace-nowrap">
									{#if team.division}
										<span class="text-sm text-gray-300">{team.division.name}</span>
									{:else}
										<span class="text-sm text-gray-500">—</span>
									{/if}
								</td>
								<td class="px-6 py-3 whitespace-nowrap">
									{#if team.region}
										<div class="text-sm text-gray-300">{team.region.name}</div>
										{#if team.season}
											<div class="text-xs text-gray-500">Season {team.season.seasonNum}</div>
										{/if}
									{:else}
										<span class="text-sm text-gray-500">—</span>
									{/if}
								</td>
								<td class="px-6 py-3 whitespace-nowrap">
									<div class="text-sm font-medium text-white">
										{team.wins}W - {team.losses}L
									</div>
								</td>
								<td class="px-6 py-3 whitespace-nowrap">
									<span class="text-sm text-gray-300">{team._count.players}</span>
								</td>
								<td class="px-6 py-3 whitespace-nowrap">
									<span class="px-2 py-1 rounded text-xs font-semibold {getStatusBadge(team.status)}">
										{getStatusLabel(team.status)}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- Pagination -->
		{#if data.pagination.totalPages > 1}
			<div class="mt-6 flex items-center justify-between">
				<div class="text-sm text-gray-400">
					Showing {((data.pagination.currentPage - 1) * data.pagination.perPage) + 1} to {Math.min(data.pagination.currentPage * data.pagination.perPage, data.pagination.totalCount)} of {data.pagination.totalCount} teams
				</div>
				
				<div class="flex items-center gap-2">
					<button
						onclick={() => changePage(data.pagination.currentPage - 1)}
						disabled={!data.pagination.hasPreviousPage}
						class="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Previous
					</button>
					
					<div class="flex items-center gap-1">
						{#each Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1) as pageNum}
							{#if pageNum === 1 || pageNum === data.pagination.totalPages || (pageNum >= data.pagination.currentPage - 2 && pageNum <= data.pagination.currentPage + 2)}
								<button
									onclick={() => changePage(pageNum)}
									class="px-3 py-2 rounded-lg transition-colors {pageNum === data.pagination.currentPage ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-800 border border-zinc-700 text-gray-300 hover:bg-zinc-700'}"
								>
									{pageNum}
								</button>
							{:else if pageNum === data.pagination.currentPage - 3 || pageNum === data.pagination.currentPage + 3}
								<span class="px-2 text-gray-500">...</span>
							{/if}
						{/each}
					</div>
					
					<button
						onclick={() => changePage(data.pagination.currentPage + 1)}
						disabled={!data.pagination.hasNextPage}
						class="px-4 py-2 bg-zinc-800 border border-zinc-700 text-white rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						Next
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

