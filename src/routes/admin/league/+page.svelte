<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	let activeTab: 'seasons' | 'regions' | 'divisions' | 'arenas' = $state('seasons');
	let isSubmitting = $state(false);
	
	// Seasons state
	let showSeasonForm = $state(false);
	let editingSeason: typeof data.seasons[0] | null = $state(null);
	
	// Regions state
	let showRegionForm = $state(false);
	let editingRegion: typeof data.regions[0] | null = $state(null);
	
	// Divisions state
	let showDivisionForm = $state(false);
	let editingDivision: typeof data.divisions[0] | null = $state(null);
	
	// Arenas state
	let showArenaForm = $state(false);
	let editingArena: typeof data.arenas[0] | null = $state(null);
	let deletingArena: typeof data.arenas[0] | null = $state(null);
	
	// Map Ban Pools state
	let showPoolForm = $state(false);
	let editingPool: typeof data.mapBanPools[0] | null = $state(null);
	let deletingPool: typeof data.mapBanPools[0] | null = $state(null);
	let addingMapsToPool: typeof data.mapBanPools[0] | null = $state(null);
	
	// Playoff management state
	let showPlayoffModal: typeof data.seasons[0] | null = $state(null);
	
	let seasonsByRegion = $derived(data.seasons.reduce((acc, season) => {
		if (!acc[season.region]) {
			acc[season.region] = [];
		}
		acc[season.region].push(season);
		return acc;
	}, {} as Record<string, typeof data.seasons>));
	
	let regionNames = $derived(Object.keys(seasonsByRegion).sort());
	
	function getStatusColor(status: string) {
		if (status === 'Active') return 'bg-green-500/20 text-green-400 border-green-500/30';
		if (status === 'Completed') return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
		if (status === 'Draft') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
		return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
	}
	
	function getStatusDot(status: string) {
		if (status === 'Active') return 'bg-green-500';
		if (status === 'Completed') return 'bg-gray-500';
		if (status === 'Draft') return 'bg-yellow-500';
		return 'bg-blue-500';
	}
	
	// Get the most important status for a region (priority: Active > Draft > Upcoming > Completed)
	function getRegionPrimaryStatus(seasons: typeof data.seasons): string {
		const statuses = seasons.map(s => s.status);
		if (statuses.includes('Active')) return 'Active';
		if (statuses.includes('Draft')) return 'Draft';
		if (statuses.includes('Upcoming')) return 'Upcoming';
		return 'Completed';
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">League Configuration</h2>
		<p class="text-gray-400">Manage seasons, regions, divisions, and arenas</p>
	</div>
	
	<!-- Tab Navigation -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-1 flex gap-1">
		<button
			onclick={() => activeTab = 'seasons'}
			class="flex-1 px-4 py-2 rounded-md transition-colors {
				activeTab === 'seasons' 
					? 'bg-orange-600 text-white font-medium' 
					: 'text-gray-400 hover:text-white hover:bg-zinc-800'
			}"
		>
			🏆 Seasons
		</button>
		<button
			onclick={() => activeTab = 'regions'}
			class="flex-1 px-4 py-2 rounded-md transition-colors {
				activeTab === 'regions' 
					? 'bg-orange-600 text-white font-medium' 
					: 'text-gray-400 hover:text-white hover:bg-zinc-800'
			}"
		>
			🌍 Regions
		</button>
		<button
			onclick={() => activeTab = 'divisions'}
			class="flex-1 px-4 py-2 rounded-md transition-colors {
				activeTab === 'divisions' 
					? 'bg-orange-600 text-white font-medium' 
					: 'text-gray-400 hover:text-white hover:bg-zinc-800'
			}"
		>
			📊 Divisions
		</button>
		<button
			onclick={() => activeTab = 'arenas'}
			class="flex-1 px-4 py-2 rounded-md transition-colors {
				activeTab === 'arenas' 
					? 'bg-orange-600 text-white font-medium' 
					: 'text-gray-400 hover:text-white hover:bg-zinc-800'
			}"
		>
			🗺️ Arenas & Maps
		</button>
	</div>
	
	<!-- Success/Error Messages -->
	{#if form?.success && form?.message}
		<div class="fixed top-4 right-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg shadow-lg z-50">
			<p class="text-green-400">{form.message}</p>
		</div>
	{/if}
	
	{#if form?.error && !editingSeason && !editingRegion && !editingDivision && !editingArena && !deletingArena}
		<div class="fixed top-4 right-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg shadow-lg z-50">
			<p class="text-red-400">{form.error}</p>
		</div>
	{/if}
	
	<!-- Tab Content -->
	{#if activeTab === 'seasons'}
		<!-- SEASONS TAB -->
		<div>
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-xl font-bold text-white">Seasons</h3>
				<button 
					onclick={() => showSeasonForm = !showSeasonForm}
					class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					{showSeasonForm ? '✕ Cancel' : '+ Create Season'}
				</button>
			</div>
			
			{#if showSeasonForm}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
					<h4 class="text-lg font-semibold text-white mb-4">Create New Season</h4>
					
					{#if form?.error}
						<div class="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
							<p class="text-red-400 text-sm">{form.error}</p>
						</div>
					{/if}
					
					{#if form?.success}
						<div class="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
							<p class="text-green-400 text-sm">{form.message}</p>
						</div>
					{/if}
					
					<form 
						method="POST" 
						action="?/createSeason"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update, result }) => {
								await update();
								isSubmitting = false;
								if (result.type === 'success') {
									showSeasonForm = false;
								}
							};
						}}
					>
						<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
							<div>
								<label for="seasonNum" class="block text-sm font-medium text-gray-300 mb-2">Season Number</label>
								<input
									id="seasonNum"
									name="seasonNum"
									type="number"
									placeholder="5"
									required
									min="1"
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
							<div>
								<label for="regionId" class="block text-sm font-medium text-gray-300 mb-2">Region</label>
								<select
									id="regionId"
									name="regionId"
									required
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								>
									{#each data.regions as region}
										<option value={region.id}>{region.name}</option>
									{/each}
								</select>
							</div>
							<div>
								<label for="numWeeks" class="block text-sm font-medium text-gray-300 mb-2">Number of Weeks</label>
								<input
									id="numWeeks"
									name="numWeeks"
									type="number"
									placeholder="10"
									required
									min="1"
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
						</div>
						<div class="mt-4 flex justify-end gap-3">
							<button 
								type="button"
								onclick={() => showSeasonForm = false}
								class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button 
								type="submit"
								disabled={isSubmitting}
								class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
							>
								{isSubmitting ? 'Creating...' : 'Create Season'}
							</button>
						</div>
					</form>
				</div>
			{/if}
			
			{#if data.seasons.length === 0}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
					<p class="text-gray-400 text-lg mb-4">No seasons found</p>
					<p class="text-gray-500 text-sm">Create your first season to get started</p>
				</div>
			{:else}
				<div class="space-y-6">
					{#each regionNames as regionName}
						<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
							<div class="bg-zinc-800/50 px-6 py-4 border-b border-zinc-800">
								<div class="flex items-center justify-between">
									<div>
										<h3 class="text-xl font-bold text-white">{regionName}</h3>
										<p class="text-sm text-gray-400 mt-1">{seasonsByRegion[regionName].length} season{seasonsByRegion[regionName].length !== 1 ? 's' : ''}</p>
									</div>
									<span class="px-2 py-1 text-xs rounded border {getStatusColor(getRegionPrimaryStatus(seasonsByRegion[regionName]))}">
									{getRegionPrimaryStatus(seasonsByRegion[regionName])}
								</span>
								</div>
							</div>
							
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead class="bg-zinc-800/30">
										<tr class="text-left text-sm text-gray-400">
											<th class="px-6 py-3 font-medium">Season</th>
											<th class="px-6 py-3 font-medium">Status</th>
											<th class="px-6 py-3 font-medium">Duration</th>
											<th class="px-6 py-3 font-medium">Teams</th>
											<th class="px-6 py-3 font-medium">Matches</th>
											<th class="px-6 py-3 font-medium">Playoffs</th>
											<th class="px-6 py-3 font-medium text-right">Actions</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-zinc-800">
										{#each seasonsByRegion[regionName].sort((a, b) => b.seasonNum - a.seasonNum) as season}
											<tr class="hover:bg-zinc-800/30 transition-colors">
												<td class="px-6 py-4">
													<div class="flex items-center gap-3">
														<div class="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
															<span class="text-lg font-bold text-orange-400">{season.seasonNum}</span>
														</div>
														<div>
															<div class="font-semibold text-white">Season {season.seasonNum}</div>
															<div class="text-xs text-gray-500">ID: {season.id}</div>
														</div>
													</div>
												</td>
												<td class="px-6 py-4">
													<div class="flex items-center gap-2">
														<span class="w-2 h-2 rounded-full {getStatusDot(season.status)}"></span>
														<span class="text-sm text-gray-300">{season.status}</span>
													</div>
												</td>
												<td class="px-6 py-4">
													<span class="text-sm text-gray-300">{season.numWeeks} weeks</span>
												</td>
												<td class="px-6 py-4">
													<span class="text-sm font-medium text-white">{season.teams}</span>
													<span class="text-xs text-gray-500 ml-1">teams</span>
												</td>
												<td class="px-6 py-4">
													<span class="text-sm font-medium text-white">{season.matches}</span>
													<span class="text-xs text-gray-500 ml-1">matches</span>
												</td>
												<td class="px-6 py-4">
													{#if season.playoff}
														<span class="text-sm text-gray-300">
															{season.playoff.isTournament ? 'Tournament' : `${season.playoff.numRounds} Rounds`}
														</span>
													{:else}
														<span class="text-sm text-gray-500">Not set</span>
													{/if}
												</td>
												<td class="px-6 py-4">
													<div class="flex items-center justify-end gap-2">
														<button 
															onclick={() => showPlayoffModal = season}
															class="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded transition-colors"
														>
															{season.playoff ? 'Update Playoffs' : 'Add Playoffs'}
														</button>
														<button 
															onclick={() => editingSeason = season}
															class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
														>
															Edit
														</button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else if activeTab === 'regions'}
		<!-- REGIONS TAB -->
		<div>
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-xl font-bold text-white">Regions</h3>
				<button 
					onclick={() => showRegionForm = !showRegionForm}
					class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					{showRegionForm ? '✕ Cancel' : '+ Add Region'}
				</button>
			</div>
			
			{#if showRegionForm}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
					<h4 class="text-lg font-semibold text-white mb-4">Create New Region</h4>
					<form 
						method="POST" 
						action="?/createRegion"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update, result }) => {
								await update();
								isSubmitting = false;
								if (result.type === 'success') {
									showRegionForm = false;
								}
							};
						}}
					>
						<div class="flex gap-4">
							<div class="flex-1">
								<label for="region-name" class="block text-sm font-medium text-gray-300 mb-2">Region Name</label>
								<input
									id="region-name"
									name="name"
									type="text"
									placeholder="North America"
									required
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
							<div class="flex items-end">
								<button 
									type="submit"
									disabled={isSubmitting}
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
								>
									{isSubmitting ? 'Creating...' : 'Create Region'}
								</button>
							</div>
						</div>
					</form>
				</div>
			{/if}
			
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<table class="w-full">
					<thead class="bg-zinc-800/30">
						<tr class="text-left text-sm text-gray-400">
							<th class="px-6 py-3 font-medium">Region</th>
							<th class="px-6 py-3 font-medium">Visibility</th>
							<th class="px-6 py-3 font-medium">Seasons</th>
							<th class="px-6 py-3 font-medium">Teams</th>
							<th class="px-6 py-3 font-medium text-right">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each data.regions as region}
							<tr class="hover:bg-zinc-800/30 transition-colors">
								<td class="px-6 py-4">
									<span class="font-semibold text-white">{region.name}</span>
								</td>
								<td class="px-6 py-4">
									<span class="px-2 py-1 rounded text-xs font-medium {region.hidden === 0 ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">
										{region.hidden === 0 ? 'Visible' : 'Hidden'}
									</span>
								</td>
								<td class="px-6 py-4 text-gray-300">{region.seasons}</td>
								<td class="px-6 py-4 text-gray-300">{region.teams}</td>
								<td class="px-6 py-4">
									<div class="flex items-center justify-end gap-2">
										<form method="POST" action="?/toggleRegionVisibility" use:enhance>
											<input type="hidden" name="regionId" value={region.id} />
											<button 
												type="submit"
												class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
											>
												{region.hidden === 0 ? 'Hide' : 'Show'}
											</button>
										</form>
										<button 
											onclick={() => editingRegion = region}
											class="px-3 py-1.5 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
										>
											Edit
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{:else if activeTab === 'divisions'}
		<!-- DIVISIONS TAB -->
		<div>
			<div class="flex items-center justify-between mb-6">
				<h3 class="text-xl font-bold text-white">Divisions</h3>
				<button 
					onclick={() => showDivisionForm = !showDivisionForm}
					class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
				>
					{showDivisionForm ? '✕ Cancel' : '+ Add Division'}
				</button>
			</div>
			
			{#if showDivisionForm}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
					<h4 class="text-lg font-semibold text-white mb-4">Create New Division</h4>
					<form 
						method="POST" 
						action="?/createDivision"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update, result }) => {
								await update();
								isSubmitting = false;
								if (result.type === 'success') {
									showDivisionForm = false;
								}
							};
						}}
					>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label for="division-name" class="block text-sm font-medium text-gray-300 mb-2">Division Name</label>
								<input
									id="division-name"
									name="name"
									type="text"
									placeholder="Open"
									required
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
							<div>
								<label for="signup-cost" class="block text-sm font-medium text-gray-300 mb-2">Signup Cost ($)</label>
								<input
									id="signup-cost"
									name="signupCost"
									type="number"
									placeholder="0.00"
									step="0.01"
									min="0"
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
						</div>
						<div class="mt-4 flex justify-end gap-3">
							<button 
								type="button"
								onclick={() => showDivisionForm = false}
								class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button 
								type="submit"
								disabled={isSubmitting}
								class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
							>
								{isSubmitting ? 'Creating...' : 'Create Division'}
							</button>
						</div>
					</form>
				</div>
			{/if}
			
			{#if data.divisions.length === 0}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
					<p class="text-gray-400 text-lg mb-4">No divisions found</p>
					<p class="text-gray-500 text-sm">Create your first division to get started</p>
				</div>
			{:else}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
					<table class="w-full">
						<thead class="bg-zinc-800/30">
							<tr class="text-left text-sm text-gray-400">
								<th class="px-6 py-3 font-medium">Division</th>
								<th class="px-6 py-3 font-medium">Signup Cost</th>
								<th class="px-6 py-3 font-medium">Visibility</th>
								<th class="px-6 py-3 font-medium">Teams</th>
								<th class="px-6 py-3 font-medium text-right">Actions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800">
							{#each data.divisions as division}
								<tr class="hover:bg-zinc-800/30 transition-colors">
									<td class="px-6 py-4">
										<div class="flex items-center gap-3">
											<div class="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
												<span class="text-lg font-bold text-orange-400">{division.name.charAt(0).toUpperCase()}</span>
											</div>
											<div>
												<div class="font-semibold text-white">{division.name}</div>
												<div class="text-xs text-gray-500">ID: {division.id}</div>
											</div>
										</div>
									</td>
									<td class="px-6 py-4">
										{#if division.signupCost > 0}
											<span class="text-sm font-medium text-green-400">${division.signupCost.toFixed(2)}</span>
										{:else}
											<span class="text-sm text-gray-500">Free</span>
										{/if}
									</td>
									<td class="px-6 py-4">
										<span class="px-2 py-1 rounded text-xs font-medium {division.hidden === 0 ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">
											{division.hidden === 0 ? 'Visible' : 'Hidden'}
										</span>
									</td>
									<td class="px-6 py-4">
										<span class="text-sm font-medium text-white">{division.teams}</span>
										<span class="text-xs text-gray-500 ml-1">teams</span>
									</td>
									<td class="px-6 py-4">
										<div class="flex items-center justify-end gap-2">
											<form method="POST" action="?/toggleDivisionVisibility" use:enhance>
												<input type="hidden" name="divisionId" value={division.id} />
												<button 
													type="submit"
													class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
												>
													{division.hidden === 0 ? 'Hide' : 'Show'}
												</button>
											</form>
											<button 
												onclick={() => editingDivision = division}
												class="px-3 py-1.5 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
											>
												Edit
											</button>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	{:else if activeTab === 'arenas'}
		<!-- ARENAS & MAPS TAB -->
		<div class="space-y-8">
			<!-- ARENAS SECTION -->
			<div>
				<div class="flex items-center justify-between mb-6">
					<div>
						<h3 class="text-xl font-bold text-white">Arenas</h3>
						<p class="text-sm text-gray-400 mt-1">Manage map arenas for matches</p>
					</div>
					<button 
						onclick={() => showArenaForm = !showArenaForm}
						class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
					>
						{showArenaForm ? '✕ Cancel' : '+ Add Arena'}
					</button>
				</div>
				
				{#if showArenaForm}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
						<h4 class="text-lg font-semibold text-white mb-4">Create New Arena</h4>
						<form 
							method="POST" 
							action="?/createArena"
							enctype="multipart/form-data"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update, result }) => {
									await update();
									isSubmitting = false;
									if (result.type === 'success') {
										showArenaForm = false;
										await invalidateAll();
									}
								};
							}}
						>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label for="arena-name" class="block text-sm font-medium text-gray-300 mb-2">Arena Name</label>
									<input
										id="arena-name"
										name="name"
										type="text"
										placeholder="Badlands"
										required
										class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
									/>
								</div>
								<div>
									<label for="arena-avatar-file" class="block text-sm font-medium text-gray-300 mb-2">
										Upload Image
										<span class="text-xs text-gray-500 ml-1">(JPEG, PNG, GIF, WebP - max 5MB)</span>
									</label>
									<input
										id="arena-avatar-file"
										name="avatarFile"
										type="file"
										accept="image/jpeg,image/png,image/gif,image/webp"
										class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-orange-600 file:text-white hover:file:bg-orange-500"
									/>
								</div>
								<div>
									<label for="playoff-map" class="block text-sm font-medium text-gray-300 mb-2">Playoff Map</label>
									<select
										id="playoff-map"
										name="playoffMap"
										class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
									>
										<option value="false">No</option>
										<option value="true">Yes</option>
									</select>
								</div>
							</div>
							<div class="mt-4">
								<label for="arena-avatar-url" class="block text-sm font-medium text-gray-300 mb-2">
									Or enter Image URL
									<span class="text-xs text-gray-500 ml-1">(alternative to file upload)</span>
								</label>
								<input
									id="arena-avatar-url"
									name="avatarUrl"
									type="text"
									placeholder="https://example.com/arena.png"
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								/>
							</div>
							<div class="mt-4 flex justify-end gap-3">
								<button 
									type="button"
									onclick={() => showArenaForm = false}
									class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
								>
									Cancel
								</button>
								<button 
									type="submit"
									disabled={isSubmitting}
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
								>
									{isSubmitting ? 'Creating...' : 'Create Arena'}
								</button>
							</div>
						</form>
					</div>
				{/if}
				
				{#if data.arenas.length === 0}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
						<p class="text-gray-400 text-lg mb-4">No arenas found</p>
						<p class="text-gray-500 text-sm">Create your first arena to get started</p>
					</div>
				{:else}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
						<table class="w-full">
							<thead class="bg-zinc-800/30">
								<tr class="text-left text-xs text-gray-400">
									<th class="px-4 py-2 font-medium">Arena</th>
									<th class="px-4 py-2 font-medium">Playoff Map</th>
									<th class="px-4 py-2 font-medium">Games</th>
									<th class="px-4 py-2 font-medium text-right">Actions</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-zinc-800">
								{#each data.arenas as arena}
									<tr class="hover:bg-zinc-800/30 transition-colors">
										<td class="px-4 py-2">
											<div class="flex items-center gap-2">
												<div class="w-8 h-8 rounded bg-orange-500/10 border border-orange-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
													{#if arena.avatar}
														<img 
															src={arena.avatar} 
															alt={arena.name} 
															class="w-full h-full object-cover"
															onerror={(e) => { 
																const img = e.target as HTMLImageElement;
																img.style.display = 'none';
																(img.nextElementSibling as HTMLElement)?.style.setProperty('display', 'block');
															}}
														/>
														<span class="text-lg text-gray-500" style="display: none;">?</span>
													{:else}
														<span class="text-lg text-gray-500">?</span>
													{/if}
												</div>
												<span class="text-sm font-medium text-white">{arena.name}</span>
											</div>
										</td>
										<td class="px-4 py-2">
											<span class="px-2 py-0.5 rounded text-xs font-medium {arena.playoffMap === 1 ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400'}">
												{arena.playoffMap === 1 ? 'Yes' : 'No'}
											</span>
										</td>
										<td class="px-4 py-2">
											<span class="text-sm text-gray-300">{arena.games}</span>
										</td>
										<td class="px-4 py-2">
											<div class="flex items-center justify-end gap-1.5">
												<button 
													onclick={() => editingArena = arena}
													class="px-2 py-1 text-xs bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
												>
													Edit
												</button>
												<button 
													onclick={() => deletingArena = arena}
													class="px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
												>
													Delete
												</button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- MAP BAN POOLS SECTION -->
			<div class="pt-8 border-t border-zinc-800">
				<div class="flex items-center justify-between mb-6">
					<div>
						<h3 class="text-xl font-bold text-white">Map Ban Pools</h3>
						<p class="text-sm text-gray-400 mt-1">Manage map pools for ban/pick phase</p>
					</div>
					<button 
						onclick={() => showPoolForm = !showPoolForm}
						class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
					>
						{showPoolForm ? '✕ Cancel' : '+ Create Pool'}
					</button>
				</div>
				
				{#if showPoolForm}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
						<h4 class="text-lg font-semibold text-white mb-4">Create New Map Ban Pool</h4>
						<form 
							method="POST" 
							action="?/createMapBanPool"
							use:enhance={() => {
								isSubmitting = true;
								return async ({ update, result }) => {
									await update();
									isSubmitting = false;
									if (result.type === 'success') {
										showPoolForm = false;
									}
								};
							}}
						>
							<div class="flex gap-4">
								<div class="flex-1">
									<label for="pool-name" class="block text-sm font-medium text-gray-300 mb-2">Pool Name</label>
									<input
										id="pool-name"
										name="name"
										type="text"
										placeholder="Season 5 Map Pool"
										required
										class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
									/>
								</div>
								<div class="flex items-end gap-3">
									<button 
										type="button"
										onclick={() => showPoolForm = false}
										class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
									>
										Cancel
									</button>
									<button 
										type="submit"
										disabled={isSubmitting}
										class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
									>
										{isSubmitting ? 'Creating...' : 'Create Pool'}
									</button>
								</div>
							</div>
						</form>
					</div>
				{/if}
				
				{#if data.mapBanPools.length === 0}
					<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
						<p class="text-gray-400 text-lg mb-4">No map ban pools found</p>
						<p class="text-gray-500 text-sm">Create your first pool to get started</p>
					</div>
				{:else}
					<div class="space-y-4">
						{#each data.mapBanPools as pool}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
								<div class="flex items-start justify-between mb-4">
									<div class="flex-1">
										<div class="flex items-center gap-3">
											<h4 class="text-lg font-semibold text-white">{pool.name}</h4>
											<span class="px-2 py-1 rounded text-xs font-medium {pool.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}">
												{pool.isActive ? 'Active' : 'Inactive'}
											</span>
		</div>
										<p class="text-xs text-gray-500 mt-1">
											{pool.maps.length} maps • Used in {pool.matchesUsed} matches
										</p>
									</div>
									<div class="flex items-center gap-2">
										<form method="POST" action="?/toggleMapBanPoolStatus" use:enhance>
											<input type="hidden" name="poolId" value={pool.id} />
											<button 
												type="submit"
												class="px-3 py-1.5 text-sm rounded transition-colors {pool.isActive ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}"
											>
												{pool.isActive ? 'Deactivate' : 'Activate'}
											</button>
										</form>
										<button 
											onclick={() => addingMapsToPool = pool}
											class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
										>
											Add Maps
										</button>
										<button 
											onclick={() => editingPool = pool}
											class="px-3 py-1.5 text-sm bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors"
										>
											Edit
										</button>
										<button 
											onclick={() => deletingPool = pool}
											class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
										>
											Delete
										</button>
									</div>
								</div>
								
								{#if pool.maps.length > 0}
									<div class="flex flex-wrap gap-2">
										{#each pool.maps as map}
											<div class="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg border border-zinc-700">
												<div class="w-6 h-6 rounded flex items-center justify-center flex-shrink-0">
													{#if map.avatar}
														<img 
															src={map.avatar} 
															alt={map.name} 
															class="w-full h-full rounded object-cover"
															onerror={(e) => { 
																const img = e.target as HTMLImageElement;
																img.style.display = 'none';
																(img.nextElementSibling as HTMLElement)?.style.setProperty('display', 'block');
															}}
														/>
														<span class="text-xs text-gray-500" style="display: none;">?</span>
													{:else}
														<span class="text-xs text-gray-500">?</span>
													{/if}
												</div>
												<span class="text-sm text-gray-300">{map.name}</span>
												<form method="POST" action="?/removeMapFromPool" use:enhance class="ml-1">
													<input type="hidden" name="poolId" value={pool.id} />
													<input type="hidden" name="arenaId" value={map.id} />
													<button 
														type="submit"
														class="text-red-400 hover:text-red-300 transition-colors"
													>
														×
													</button>
												</form>
											</div>
										{/each}
									</div>
								{:else}
									<div class="text-center py-4 text-gray-500 text-sm">
										No maps in this pool yet. Click "Add Maps" to add some.
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Edit Region Modal -->
{#if editingRegion}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => editingRegion = null}
		onkeydown={(e) => e.key === 'Escape' && (editingRegion = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Edit Region</h3>
				<button 
					onclick={() => editingRegion = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<form 
				method="POST" 
				action="?/updateRegion"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							editingRegion = null;
						}
					};
				}}
			>
				<input type="hidden" name="regionId" value={editingRegion.id} />
				
				<div class="mb-4">
					<label for="edit-region-name" class="block text-sm font-medium text-gray-300 mb-2">Region Name</label>
					<input
						id="edit-region-name"
						name="name"
						type="text"
						value={editingRegion.name}
						required
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => editingRegion = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Season Modal -->
{#if editingSeason}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => editingSeason = null}
		onkeydown={(e) => e.key === 'Escape' && (editingSeason = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Edit Season {editingSeason.seasonNum}</h3>
				<button 
					onclick={() => editingSeason = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			{#if form?.error}
				<div class="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
					<p class="text-red-400 text-sm">{form.error}</p>
				</div>
			{/if}
			
			<form 
				method="POST" 
				action="?/updateSeason"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							editingSeason = null;
						}
					};
				}}
			>
				<input type="hidden" name="seasonId" value={editingSeason.id} />
				
				<div class="space-y-4">
					<div>
						<label for="edit-seasonNum" class="block text-sm font-medium text-gray-300 mb-2">Season Number</label>
						<input
							id="edit-seasonNum"
							name="seasonNum"
							type="number"
							value={editingSeason.seasonNum}
							required
							min="1"
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
					
					<div>
						<label for="edit-regionId" class="block text-sm font-medium text-gray-300 mb-2">Region</label>
						<select
							id="edit-regionId"
							name="regionId"
							value={editingSeason.regionId}
							required
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							{#each data.regions as region}
								<option value={region.id}>{region.name}</option>
							{/each}
						</select>
					</div>
					
					<div>
						<label for="edit-numWeeks" class="block text-sm font-medium text-gray-300 mb-2">Number of Weeks</label>
						<input
							id="edit-numWeeks"
							name="numWeeks"
							type="number"
							value={editingSeason.numWeeks}
							required
							min="1"
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
				</div>
				
				<div class="mt-6 flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => editingSeason = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Division Modal -->
{#if editingDivision}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => editingDivision = null}
		onkeydown={(e) => e.key === 'Escape' && (editingDivision = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Edit Division</h3>
				<button 
					onclick={() => editingDivision = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<form 
				method="POST" 
				action="?/updateDivision"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							editingDivision = null;
						}
					};
				}}
			>
				<input type="hidden" name="divisionId" value={editingDivision.id} />
				
				<div class="space-y-4">
					<div>
						<label for="edit-division-name" class="block text-sm font-medium text-gray-300 mb-2">Division Name</label>
						<input
							id="edit-division-name"
							name="name"
							type="text"
							value={editingDivision.name}
							required
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
					
					<div>
						<label for="edit-signup-cost" class="block text-sm font-medium text-gray-300 mb-2">Signup Cost ($)</label>
						<input
							id="edit-signup-cost"
							name="signupCost"
							type="number"
							value={editingDivision.signupCost}
							step="0.01"
							min="0"
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
				</div>
				
				<div class="mt-6 flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => editingDivision = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Arena Modal -->
{#if editingArena}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => editingArena = null}
		onkeydown={(e) => e.key === 'Escape' && (editingArena = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Edit Arena</h3>
				<button 
					onclick={() => editingArena = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<form 
				method="POST" 
				action="?/updateArena"
				enctype="multipart/form-data"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							editingArena = null;
							await invalidateAll();
						}
					};
				}}
			>
				<input type="hidden" name="arenaId" value={editingArena.id} />
				
				<div class="space-y-4">
					<div>
						<label for="edit-arena-name" class="block text-sm font-medium text-gray-300 mb-2">Arena Name</label>
						<input
							id="edit-arena-name"
							name="name"
							type="text"
							value={editingArena.name}
							required
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						/>
					</div>
					
					<div>
						<label for="edit-arena-avatar-file" class="block text-sm font-medium text-gray-300 mb-2">
							Arena Image
							<span class="text-xs text-gray-500 ml-1">(JPEG, PNG, GIF, WebP - max 5MB)</span>
						</label>
						<div class="flex items-start gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700">
							{#if editingArena.avatar}
								<img src={editingArena.avatar} alt={editingArena.name} class="w-16 h-16 rounded object-cover flex-shrink-0" />
							{:else}
								<div class="w-16 h-16 rounded bg-zinc-700 flex items-center justify-center flex-shrink-0">
									<span class="text-2xl text-gray-500">?</span>
								</div>
							{/if}
							<div class="flex-1">
								<input
									id="edit-arena-avatar-file"
									name="avatarFile"
									type="file"
									accept="image/jpeg,image/png,image/gif,image/webp"
									class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer cursor-pointer"
								/>
								<input
									type="hidden"
									name="avatarUrl"
									value={editingArena.avatar || ''}
								/>
							</div>
						</div>
					</div>
					
					<div>
						<label for="edit-playoff-map" class="block text-sm font-medium text-gray-300 mb-2">Playoff Map</label>
						<select
							id="edit-playoff-map"
							name="playoffMap"
							value={editingArena.playoffMap === 1 ? 'true' : 'false'}
							class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
						>
							<option value="false">No</option>
							<option value="true">Yes</option>
						</select>
					</div>
				</div>
				
				<div class="mt-6 flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => editingArena = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Arena Modal -->
{#if deletingArena}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => deletingArena = null}
		onkeydown={(e) => e.key === 'Escape' && (deletingArena = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Delete Arena</h3>
				<button 
					onclick={() => deletingArena = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<div class="mb-6">
				<p class="text-gray-300 mb-4">
					Are you sure you want to delete <strong class="text-white">{deletingArena.name}</strong>?
				</p>
				
				{#if deletingArena.games > 0}
					<div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
						<p class="text-yellow-400 text-sm font-medium mb-2">⚠️ Warning</p>
						<p class="text-yellow-300 text-sm">
							This arena has {deletingArena.games} game{deletingArena.games !== 1 ? 's' : ''} played on it. 
							You cannot delete it until these are removed.
						</p>
					</div>
				{:else}
					<div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
						<p class="text-red-400 text-sm">
							⚠️ This action cannot be undone.
						</p>
					</div>
				{/if}
			</div>
			
			<form 
				method="POST" 
				action="?/deleteArena"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							deletingArena = null;
						}
					};
				}}
			>
				<input type="hidden" name="arenaId" value={deletingArena.id} />
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => deletingArena = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting || deletingArena.games > 0}
						class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Deleting...' : 'Delete Arena'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Edit Map Ban Pool Modal -->
{#if editingPool}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => editingPool = null}
		onkeydown={(e) => e.key === 'Escape' && (editingPool = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Edit Map Ban Pool</h3>
				<button 
					onclick={() => editingPool = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<form 
				method="POST" 
				action="?/updateMapBanPool"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							editingPool = null;
						}
					};
				}}
			>
				<input type="hidden" name="poolId" value={editingPool.id} />
				
				<div class="mb-4">
					<label for="edit-pool-name" class="block text-sm font-medium text-gray-300 mb-2">Pool Name</label>
					<input
						id="edit-pool-name"
						name="name"
						type="text"
						value={editingPool.name}
						required
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
					/>
				</div>
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => editingPool = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Saving...' : 'Save Changes'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Map Ban Pool Modal -->
{#if deletingPool}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => deletingPool = null}
		onkeydown={(e) => e.key === 'Escape' && (deletingPool = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Delete Map Ban Pool</h3>
				<button 
					onclick={() => deletingPool = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<div class="mb-6">
				<p class="text-gray-300 mb-4">
					Are you sure you want to delete <strong class="text-white">{deletingPool.name}</strong>?
				</p>
				
				{#if deletingPool.matchesUsed > 0}
					<div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
						<p class="text-yellow-400 text-sm font-medium mb-2">⚠️ Warning</p>
						<p class="text-yellow-300 text-sm">
							This pool is used in {deletingPool.matchesUsed} match{deletingPool.matchesUsed !== 1 ? 'es' : ''}. 
							You cannot delete it until these are removed.
						</p>
					</div>
				{:else}
					<div class="p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
						<p class="text-red-400 text-sm">
							⚠️ This action cannot be undone. All maps in this pool will be removed.
						</p>
					</div>
				{/if}
			</div>
			
			<form 
				method="POST" 
				action="?/deleteMapBanPool"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							deletingPool = null;
						}
					};
				}}
			>
				<input type="hidden" name="poolId" value={deletingPool.id} />
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => deletingPool = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting || deletingPool.matchesUsed > 0}
						class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Deleting...' : 'Delete Pool'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Add Maps to Pool Modal -->
{#if addingMapsToPool}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => addingMapsToPool = null}
		onkeydown={(e) => e.key === 'Escape' && (addingMapsToPool = null)}
		role="button"
		tabindex="-1"
	>
		<div 
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-2xl w-full" 
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="0"
		>
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-bold text-white">Add Maps to {addingMapsToPool.name}</h3>
				<button 
					onclick={() => addingMapsToPool = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<form 
				method="POST" 
				action="?/addMapsToPool"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							addingMapsToPool = null;
						}
					};
				}}
			>
				<input type="hidden" name="poolId" value={addingMapsToPool.id} />
				
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6 max-h-96 overflow-y-auto">
					{#each data.arenas as arena}
						{@const isInPool = addingMapsToPool.maps.some(m => m.id === arena.id)}
						<label class="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-zinc-700 cursor-pointer hover:border-orange-500 transition-colors {isInPool ? 'opacity-50' : ''}">
							<input 
								type="checkbox" 
								name="arenaIds" 
								value={arena.id} 
								disabled={isInPool}
								class="rounded border-gray-600 bg-zinc-700"
							/>
							<div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0">
								{#if arena.avatar}
									<img 
										src={arena.avatar} 
										alt={arena.name} 
										class="w-full h-full rounded object-cover"
										onerror={(e) => { 
											const img = e.target as HTMLImageElement;
											img.style.display = 'none';
											(img.nextElementSibling as HTMLElement)?.style.setProperty('display', 'block');
										}}
									/>
									<span class="text-sm text-gray-500" style="display: none;">?</span>
								{:else}
									<span class="text-sm text-gray-500">?</span>
								{/if}
							</div>
							<span class="text-sm text-gray-300">{arena.name}</span>
						</label>
					{/each}
				</div>
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => addingMapsToPool = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting}
						class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Adding...' : 'Add Selected Maps'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Playoff Management Modal -->
{#if showPlayoffModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl max-w-md w-full">
			<div class="p-6">
				<h3 class="text-xl font-bold text-white mb-4">Manage Playoffs</h3>
				<p class="text-gray-400 text-sm mb-6">Configure playoff settings for Season {showPlayoffModal.seasonNum} ({showPlayoffModal.region})</p>
				
				<form 
					method="POST" 
					action="?/managePlayoff"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ update, result }) => {
							await update();
							isSubmitting = false;
							if (result.type === 'success') {
								showPlayoffModal = null;
							}
						};
					}}
				>
					<input type="hidden" name="seasonId" value={showPlayoffModal.id} />
					
					<div class="space-y-4">
						<div>
							<label class="block text-sm font-medium text-gray-300 mb-2">Playoff Format</label>
							<select 
								name="format" 
								id="playoffFormat"
								class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								onchange={(e) => {
									const roundsInput = document.getElementById('roundsInput');
									if (roundsInput) {
										roundsInput.style.display = e.target.value === 'rounds' ? 'block' : 'none';
									}
								}}
							>
								<option value="tournament" selected={showPlayoffModal.playoff?.isTournament}>Tournament</option>
								<option value="rounds" selected={!showPlayoffModal.playoff?.isTournament}>Rounds</option>
							</select>
						</div>
						
						<div id="roundsInput" style="display: {showPlayoffModal.playoff?.isTournament === false ? 'block' : 'none'};">
							<label class="block text-sm font-medium text-gray-300 mb-2">Number of Rounds</label>
							<input 
								type="number" 
								name="numRounds"
								value={showPlayoffModal.playoff?.numRounds || 2}
								min="1"
								class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
							/>
							
							<div class="mt-4">
								<label class="block text-sm font-medium text-gray-300 mb-2">Double Elimination</label>
								<select 
									name="doubleElim" 
									class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
								>
									<option value="0" selected={showPlayoffModal.playoff?.doubleElim === 0}>No</option>
									<option value="1" selected={showPlayoffModal.playoff?.doubleElim === 1}>Yes</option>
								</select>
							</div>
						</div>
					</div>
					
					<div class="flex gap-3 justify-end mt-6">
						<button 
							type="button"
							onclick={() => showPlayoffModal = null}
							class="px-6 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
						>
							Cancel
						</button>
						<button 
							type="submit"
							disabled={isSubmitting}
							class="px-6 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
						>
							{isSubmitting ? 'Saving...' : 'Save'}
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
{/if}
