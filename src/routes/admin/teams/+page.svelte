<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	
	let { data }: { data: PageData } = $props();
	
	// Build filter URL
	function updateFilters(updates: Record<string, string>) {
		const params = new URLSearchParams($page.url.searchParams);
		
		// Update/remove parameters
		Object.entries(updates).forEach(([key, value]) => {
			if (value && value !== 'all' && value !== '') {
				params.set(key, value);
			} else {
				params.delete(key);
			}
		});
		
		// Reset to page 1 when filters change
		if (!updates.page) {
			params.delete('page');
		}
		
		goto(`?${params.toString()}`, { keepFocus: true, replaceState: true });
	}
	
	// Status mapping (TeamStatus enum from Prisma)
	const statusNames: Record<string, string> = {
		'UNREADY': 'Unready',
		'PENDING': 'Pending',
		'READY': 'Ready',
		'DEAD': 'Dead'
	};
	
	// Payment status mapping
	const paymentNames: Record<number, string> = {
		0: 'Unpaid',
		1: 'Paid',
		2: 'Exempt'
	};
	
	function getStatusColor(status: string) {
		if (status === 'READY') return 'bg-green-500/20 text-green-400';
		if (status === 'PENDING') return 'bg-yellow-500/20 text-yellow-400';
		if (status === 'DEAD') return 'bg-red-500/20 text-red-400';
		return 'bg-gray-500/20 text-gray-400';
	}
	
	function getPaymentColor(payment: number) {
		if (payment === 1) return 'bg-green-500/20 text-green-400';
		if (payment === 2) return 'bg-blue-500/20 text-blue-400';
		return 'bg-red-500/20 text-red-400';
	}
	
	// Pagination
	function goToPage(pageNum: number) {
		updateFilters({ page: pageNum.toString() });
	}
	
	// Generate page numbers for pagination
	const pageNumbers = $derived(() => {
		const { page, totalPages } = data.pagination;
		const pages: (number | string)[] = [];
		
		if (totalPages <= 7) {
			// Show all pages if 7 or fewer
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i);
			}
		} else {
			// Always show first page
			pages.push(1);
			
			if (page > 3) {
				pages.push('...');
			}
			
			// Show pages around current page
			for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
				pages.push(i);
			}
			
			if (page < totalPages - 2) {
				pages.push('...');
			}
			
			// Always show last page
			pages.push(totalPages);
		}
		
		return pages;
	});
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-3xl font-bold text-white mb-2">Team Management</h2>
			<p class="text-gray-400">View and manage all teams across all divisions</p>
		</div>
		<button class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
			+ Create Team
		</button>
	</div>
	
	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<form class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
			<!-- Search -->
			<input
				type="text"
				name="search"
				value={data.filters.search}
				oninput={(e) => updateFilters({ search: e.currentTarget.value })}
				placeholder="Search teams..."
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500"
			/>
			
			<!-- Season Filter -->
			<select
				name="season"
				value={data.filters.season}
				onchange={(e) => updateFilters({ season: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Seasons</option>
				{#each data.seasons as season}
					<option value={season.id.toString()}>Season {season.seasonNum}</option>
				{/each}
			</select>
			
			<!-- Division Filter -->
			<select
				name="division"
				value={data.filters.division}
				onchange={(e) => updateFilters({ division: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Divisions</option>
				{#each data.divisions as division}
					<option value={division.id.toString()}>{division.name}</option>
				{/each}
			</select>
			
			<!-- Region Filter -->
			<select
				name="region"
				value={data.filters.region}
				onchange={(e) => updateFilters({ region: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Regions</option>
				{#each data.regions as region}
					<option value={region.id.toString()}>{region.name}</option>
				{/each}
			</select>
			
			<!-- Status Filter -->
			<select
				name="status"
				value={data.filters.status}
				onchange={(e) => updateFilters({ status: e.currentTarget.value })}
				class="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
			>
				<option value="all">All Status</option>
				<option value="2">Ready</option>
				<option value="1">Pending</option>
				<option value="0">Unready</option>
				<option value="3">Dead</option>
			</select>
			
			<!-- Clear Filters Button -->
			<button
				type="button"
				onclick={() => goto('/admin/teams')}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-gray-300 hover:text-white transition-colors"
			>
				Clear Filters
			</button>
		</form>
	</div>
	
	<!-- Teams Table -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-zinc-950 border-b border-zinc-800">
					<tr>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Team</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Season</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Division</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Region</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Record</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
						<th class="px-6 py-4 text-left text-sm font-semibold text-gray-300">Payment</th>
						<th class="px-6 py-4 text-right text-sm font-semibold text-gray-300">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-800">
					{#each data.teams as team}
						<tr class="hover:bg-zinc-800/50 transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-3">
									{#if team.avatar}
										<img src={team.avatar} alt={team.name} class="w-8 h-8 rounded" />
									{:else}
										<div class="w-8 h-8 bg-zinc-700 rounded flex items-center justify-center text-xs font-bold text-gray-400">
											{team.acronym?.slice(0, 2) || team.name.slice(0, 2).toUpperCase()}
										</div>
									{/if}
									<div>
										<a href="/teams/{team.id}" class="text-white font-medium hover:text-orange-400">
											{team.name}
										</a>
										<p class="text-sm text-gray-400">{team.acronym}</p>
									</div>
								</div>
							</td>
							<td class="px-6 py-4 text-gray-300">
								{#if team.season}
									S{team.season.seasonNum}
								{:else}
									<span class="text-gray-500">—</span>
								{/if}
							</td>
							<td class="px-6 py-4 text-gray-300">
								{team.division?.name || '—'}
							</td>
							<td class="px-6 py-4 text-gray-300">
								{team.region?.name || '—'}
							</td>
							<td class="px-6 py-4 text-white font-mono">{team.record}</td>
							<td class="px-6 py-4">
								<span class="px-2 py-1 rounded text-xs font-medium {getStatusColor(team.status)}">
									{statusNames[team.status]}
								</span>
							</td>
							<td class="px-6 py-4">
								<span class="px-2 py-1 rounded text-xs font-medium {getPaymentColor(team.paymentStatus)}">
									{paymentNames[team.paymentStatus]}
								</span>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<a 
										href="/teams/{team.id}"
										class="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-sm transition-colors"
									>
										View
									</a>
									<button class="px-3 py-1 bg-zinc-700 text-gray-300 hover:bg-zinc-600 rounded text-sm transition-colors">
										Edit
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		
		{#if data.teams.length === 0}
			<div class="py-12 text-center">
				<p class="text-gray-400">No teams found matching your filters</p>
			</div>
		{/if}
	</div>
	
	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg p-4">
			<div class="text-sm text-gray-400">
				Showing {((data.pagination.page - 1) * data.pagination.pageSize) + 1} to {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalTeams)} of {data.pagination.totalTeams} teams
			</div>
			
			<div class="flex items-center gap-2">
				<!-- Previous Button -->
				<button
					onclick={() => goToPage(data.pagination.page - 1)}
					disabled={data.pagination.page === 1}
					class="px-3 py-1 bg-zinc-800 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
				>
					← Previous
				</button>
				
				<!-- Page Numbers -->
				{#each pageNumbers() as pageNum}
					{#if pageNum === '...'}
						<span class="px-2 text-gray-500">...</span>
					{:else}
						<button
							onclick={() => goToPage(pageNum as number)}
							class="px-3 py-1 rounded transition-colors {
								pageNum === data.pagination.page
									? 'bg-orange-500 text-white font-medium'
									: 'bg-zinc-800 text-gray-300 hover:bg-zinc-700'
							}"
						>
							{pageNum}
						</button>
					{/if}
				{/each}
				
				<!-- Next Button -->
				<button
					onclick={() => goToPage(data.pagination.page + 1)}
					disabled={data.pagination.page === data.pagination.totalPages}
					class="px-3 py-1 bg-zinc-800 text-gray-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
				>
					Next →
				</button>
			</div>
		</div>
	{:else}
		<!-- Summary (when no pagination needed) -->
		<div class="text-sm text-gray-400">
			Showing {data.teams.length} of {data.pagination.totalTeams} teams
		</div>
	{/if}
</div>

