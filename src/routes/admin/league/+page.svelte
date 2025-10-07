<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	let activeTab: 'seasons' | 'regions' | 'divisions' | 'arenas' = $state('seasons');
	let isSubmitting = $state(false);
	
	// Seasons state
	let showSeasonForm = $state(false);
	let editingSeason: typeof data.seasons[0] | null = $state(null);
	let deletingSeason: typeof data.seasons[0] | null = $state(null);
	
	// Regions state
	let showRegionForm = $state(false);
	let editingRegion: typeof data.regions[0] | null = $state(null);
	let deletingRegion: typeof data.regions[0] | null = $state(null);
	
	// Divisions state
	let showDivisionForm = $state(false);
	let editingDivision: typeof data.divisions[0] | null = $state(null);
	let deletingDivision: typeof data.divisions[0] | null = $state(null);
	
	// Arenas state
	let showArenaForm = $state(false);
	let editingArena: typeof data.arenas[0] | null = $state(null);
	let deletingArena: typeof data.arenas[0] | null = $state(null);
	
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
	
	{#if form?.error && !editingSeason && !deletingSeason && !editingRegion && !deletingRegion && !editingDivision && !deletingDivision && !editingArena && !deletingArena}
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
									<div class="flex items-center gap-2">
										{#each [...new Set(seasonsByRegion[regionName].map(s => s.status))] as status}
											<span class="px-2 py-1 text-xs rounded border {getStatusColor(status)}">
												{status}
											</span>
										{/each}
									</div>
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
													<div class="flex items-center justify-end gap-2">
														<button 
															onclick={() => editingSeason = season}
															class="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
														>
															Edit
														</button>
														<button 
															onclick={() => deletingSeason = season}
															class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
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
										<button 
											onclick={() => deletingRegion = region}
											class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
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
		</div>
	{:else if activeTab === 'divisions'}
		<!-- DIVISIONS TAB - Placeholder -->
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<p class="text-gray-400">Divisions tab - to be implemented</p>
		</div>
	{:else if activeTab === 'arenas'}
		<!-- ARENAS TAB - Placeholder -->
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<p class="text-gray-400">Arenas tab - to be implemented</p>
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

<!-- Delete Region Modal -->
{#if deletingRegion}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => deletingRegion = null}
		onkeydown={(e) => e.key === 'Escape' && (deletingRegion = null)}
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
				<h3 class="text-xl font-bold text-white">Delete Region</h3>
				<button 
					onclick={() => deletingRegion = null}
					class="text-gray-400 hover:text-white transition-colors"
				>
					✕
				</button>
			</div>
			
			<div class="mb-6">
				<p class="text-gray-300 mb-4">
					Are you sure you want to delete <strong class="text-white">{deletingRegion.name}</strong>?
				</p>
				
				{#if deletingRegion.seasons > 0 || deletingRegion.teams > 0}
					<div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
						<p class="text-yellow-400 text-sm font-medium mb-2">⚠️ Warning</p>
						<p class="text-yellow-300 text-sm">
							This region has {deletingRegion.seasons} season{deletingRegion.seasons !== 1 ? 's' : ''} 
							and {deletingRegion.teams} team{deletingRegion.teams !== 1 ? 's' : ''}. 
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
				action="?/deleteRegion"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							deletingRegion = null;
						}
					};
				}}
			>
				<input type="hidden" name="regionId" value={deletingRegion.id} />
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => deletingRegion = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting || deletingRegion.seasons > 0 || deletingRegion.teams > 0}
						class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Deleting...' : 'Delete Region'}
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

<!-- Delete Season Modal -->
{#if deletingSeason}
	<div 
		class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" 
		onclick={() => deletingSeason = null}
		onkeydown={(e) => e.key === 'Escape' && (deletingSeason = null)}
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
				<h3 class="text-xl font-bold text-white">Delete Season</h3>
				<button 
					onclick={() => deletingSeason = null}
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
			
			<div class="mb-6">
				<p class="text-gray-300 mb-4">
					Are you sure you want to delete <strong class="text-white">Season {deletingSeason.seasonNum}</strong> 
					from <strong class="text-white">{deletingSeason.region}</strong>?
				</p>
				
				{#if deletingSeason.teams > 0 || deletingSeason.matches > 0}
					<div class="p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
						<p class="text-yellow-400 text-sm font-medium mb-2">⚠️ Warning</p>
						<p class="text-yellow-300 text-sm">
							This season has {deletingSeason.teams} team{deletingSeason.teams !== 1 ? 's' : ''} 
							and {deletingSeason.matches} match{deletingSeason.matches !== 1 ? 'es' : ''}. 
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
				action="?/deleteSeason"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update, result }) => {
						await update();
						isSubmitting = false;
						if (result.type === 'success') {
							deletingSeason = null;
						}
					};
				}}
			>
				<input type="hidden" name="seasonId" value={deletingSeason.id} />
				
				<div class="flex gap-3 justify-end">
					<button 
						type="button"
						onclick={() => deletingSeason = null}
						class="px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button 
						type="submit"
						disabled={isSubmitting || deletingSeason.teams > 0 || deletingSeason.matches > 0}
						class="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
					>
						{isSubmitting ? 'Deleting...' : 'Delete Season'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
