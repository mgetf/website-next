<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Check for success message from create page redirect
	const createdCount = $derived($page.url.searchParams.get('created'));

	let showCreateWizard = $state(false);
	let wizardStep = $state(1);
	let selectedRegion = $state<number | null>(null);
	let selectedDivision = $state<number | null>(null);
	let selectedSeason = $state<number | null>(null);
	let previewTeams = $state<any[]>([]);
	let isPlayoff = $state(false);

	function startCreateWizard() {
		showCreateWizard = true;
		wizardStep = 1;
		selectedRegion = null;
		selectedDivision = null;
		selectedSeason = null;
		previewTeams = [];
		isPlayoff = false;
	}

	function getStatusBadge(status: string) {
		if (status === 'UNPLAYED') return 'bg-yellow-100 text-yellow-800';
		if (status === 'PLAYED') return 'bg-green-100 text-green-800';
		if (status === 'DISPUTE') return 'bg-red-100 text-red-800';
		return 'bg-gray-100 text-gray-800';
	}

	function getStatusLabel(status: string) {
		if (status === 'UNPLAYED') return 'Unplayed';
		if (status === 'PLAYED') return 'Played';
		if (status === 'DISPUTE') return 'Disputed';
		return 'Unknown';
	}

	function applyFilters(event: Event) {
		event.preventDefault();
		const form = event.target as HTMLFormElement;
		const formData = new FormData(form);
		const params = new URLSearchParams();

		for (const [key, value] of formData.entries()) {
			if (value) params.set(key, value.toString());
		}

		goto(`/admin/matches?${params.toString()}`);
	}

	function clearFilters() {
		goto('/admin/matches');
	}

	let showEditModal = $state(false);
	let editingMatch = $state<any>(null);

	function openEditModal(match: any) {
		editingMatch = match;
		showEditModal = true;
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-3xl font-bold text-white mb-2">Match Management</h2>
			<p class="text-gray-400">Create and manage league matches</p>
		</div>
		<a
			href="/admin/matches/create"
			class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold inline-block"
		>
			+ Create Matches
		</a>
	</div>

	<!-- Success Message (from create page redirect) -->
	{#if createdCount}
		<div class="bg-green-500/20 border border-green-500/50 rounded-lg p-4">
			<div class="flex items-center space-x-3">
				<div class="text-2xl">✅</div>
				<div class="flex-1">
					<p class="text-green-400 font-semibold">
						Successfully created {createdCount} match{createdCount === '1' ? '' : 'es'}!
					</p>
					<p class="text-green-300 text-sm mt-1">
						The matches are now visible in the list below. Teams have been notified.
					</p>
				</div>
				<a 
					href="/admin/matches" 
					class="text-green-400 hover:text-green-300 text-sm"
				>
					Dismiss
				</a>
			</div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<h3 class="text-lg font-semibold text-white mb-4">Filters</h3>
		<form onsubmit={applyFilters} class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Season</label>
				<select
					name="seasonId"
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				>
					<option value="">All Seasons</option>
					{#each data.seasons as season}
						<option value={season.id} selected={data.filters.seasonId === season.id.toString()}>
							{season.region.name} S{season.seasonNum}
						</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Division</label>
				<select
					name="divisionId"
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				>
					<option value="">All Divisions</option>
					{#each data.divisions as division}
						<option
							value={division.id}
							selected={data.filters.divisionId === division.id.toString()}
						>
							{division.name}
						</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Region</label>
				<select
					name="regionId"
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				>
					<option value="">All Regions</option>
					{#each data.regions as region}
						<option value={region.id} selected={data.filters.regionId === region.id.toString()}>
							{region.name}
						</option>
					{/each}
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Status</label>
				<select
					name="status"
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				>
					<option value="">All Status</option>
					<option value="0" selected={data.filters.status === '0'}>Unplayed</option>
					<option value="1" selected={data.filters.status === '1'}>Played</option>
					<option value="2" selected={data.filters.status === '2'}>Disputed</option>
				</select>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Week</label>
				<input
					type="number"
					name="weekNo"
					value={data.filters.weekNo || ''}
					placeholder="Week #"
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Search</label>
				<input
					type="text"
					name="search"
					value={data.filters.search || ''}
					placeholder="Team name..."
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			<div class="md:col-span-3 lg:col-span-6 flex space-x-3">
				<button
					type="submit"
					class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
				>
					Apply Filters
				</button>
				<button
					type="button"
					onclick={clearFilters}
					class="bg-zinc-700 text-white px-6 py-2 rounded-lg hover:bg-zinc-600 transition"
				>
					Clear
				</button>
			</div>
		</form>
	</div>

	<!-- Matches Table -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
		<div class="p-6 border-b border-zinc-800">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-semibold text-white">
					Matches ({data.pagination.totalCount})
				</h3>
				<!-- TODO: Show notification count per match (F19) -->
			</div>
		</div>

		{#if data.matches.length === 0}
			<div class="p-12 text-center text-gray-400">
				<p>No matches found</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="min-w-full">
					<thead class="bg-zinc-800">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">ID</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Teams</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Season</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Week</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Score</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each data.matches as match}
							<tr class="hover:bg-zinc-800 transition">
								<td class="px-6 py-4 text-sm text-white">#{match.id}</td>
								<td class="px-6 py-4">
									<div class="space-y-1">
										<div class="text-sm text-white">
											{match.homeTeam.name} <span class="text-gray-500">vs</span>
											{match.awayTeam.name}
										</div>
										<div class="text-xs text-gray-400">
											{match.homeTeam.division?.name} • {match.homeTeam.region?.name}
										</div>
									</div>
								</td>
								<td class="px-6 py-4 text-sm text-gray-300">
									{match.season.region.name} S{match.seasonNo}
								</td>
							<td class="px-6 py-4 text-sm text-gray-300">
								{#if match.weekLabel}
									Week {match.weekLabel}
								{:else if match.weekNo}
									Week {match.weekNo}
								{:else if match.playoffRound}
									R{match.playoffRound}
								{:else}
									-
								{/if}
							</td>
								<td class="px-6 py-4 text-sm text-white font-semibold">
									{#if match.winnerId}
										{match.winnerScore}-{match.loserScore}
									{:else}
										-
									{/if}
								</td>
								<td class="px-6 py-4">
									<span class="px-2 py-1 text-xs font-semibold rounded-full {getStatusBadge(match.status)}">
										{getStatusLabel(match.status)}
									</span>
								</td>
								<td class="px-6 py-4 text-right space-x-2">
									<a
										href="/matches/{match.id}"
										class="text-blue-400 hover:text-blue-300 text-sm"
									>
										View
									</a>
									<button
										onclick={() => openEditModal(match)}
										class="text-yellow-400 hover:text-yellow-300 text-sm"
									>
										Edit
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if data.pagination.totalPages > 1}
				<div class="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
					<div class="text-sm text-gray-400">
						Page {data.pagination.page} of {data.pagination.totalPages}
					</div>
					<div class="flex space-x-2">
						{#if data.pagination.hasPrev}
							<a
								href="?page={data.pagination.page - 1}"
								class="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition"
							>
								Previous
							</a>
						{/if}
						{#if data.pagination.hasNext}
							<a
								href="?page={data.pagination.page + 1}"
								class="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition"
							>
								Next
							</a>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Create Wizard Modal -->
	{#if showCreateWizard}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<div class="p-6 border-b border-zinc-800 flex items-center justify-between">
					<h3 class="text-xl font-bold text-white">Create Matches - Step {wizardStep}</h3>
					<button onclick={() => (showCreateWizard = false)} class="text-gray-400 hover:text-white">
						✕
					</button>
				</div>

				<div class="p-6">
					{#if wizardStep === 1}
						<!-- Step 1: Select Configuration -->
						<form 
							method="POST" 
							action="?/previewMatches" 
							use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success' && result.data && 'preview' in result.data) {
										previewTeams = (result.data as any).preview.teams;
										wizardStep = 2;
									}
									await update();
								};
							}}
						>
							<div class="space-y-4">
								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Region</label>
									<select
										name="regionId"
										bind:value={selectedRegion}
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									>
										<option value="">Select region...</option>
										{#each data.regions as region}
											<option value={region.id}>{region.name}</option>
										{/each}
									</select>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Division</label>
									<select
										name="divisionId"
										bind:value={selectedDivision}
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									>
										<option value="">Select division...</option>
										{#each data.divisions as division}
											<option value={division.id}>{division.name}</option>
										{/each}
									</select>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Season</label>
									<select
										name="seasonId"
										bind:value={selectedSeason}
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									>
										<option value="">Select season...</option>
										{#each data.seasons as season}
											{#if !selectedRegion || season.regionId === selectedRegion}
												<option value={season.id}>
													{season.region.name} Season {season.seasonNum}
												</option>
											{/if}
										{/each}
									</select>
								</div>

								<div class="flex items-center space-x-2">
									<input
										type="checkbox"
										id="isPlayoff"
										bind:checked={isPlayoff}
										class="rounded bg-zinc-800 border-zinc-700"
									/>
									<label for="isPlayoff" class="text-sm text-gray-300">Playoff Match</label>
								</div>

								<div class="pt-4">
									<button
										type="submit"
										class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
									>
										Continue
									</button>
								</div>
							</div>
						</form>
					{:else if wizardStep === 2}
						<!-- Step 2: Configure and Create -->
						<form 
							method="POST" 
							action="?/createMatchSet" 
							use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										showCreateWizard = false;
										wizardStep = 1;
										selectedRegion = null;
										selectedDivision = null;
										selectedSeason = null;
										previewTeams = [];
										isPlayoff = false;
									}
									await update();
								};
							}}
						>
							<input type="hidden" name="regionId" value={selectedRegion} />
							<input type="hidden" name="divisionId" value={selectedDivision} />
							<input type="hidden" name="seasonId" value={selectedSeason} />

							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-4">
									<div>
										<label class="block text-sm font-medium text-gray-300 mb-2">Season Number</label>
										<input
											type="number"
											name="seasonNo"
											required
											class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
										/>
									</div>

									<div>
										<label class="block text-sm font-medium text-gray-300 mb-2">Week Number</label>
										<input
											type="number"
											name="weekNo"
											required={!isPlayoff}
											disabled={isPlayoff}
											class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 disabled:opacity-50"
										/>
									</div>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Best of Series</label>
									<select
										name="boSeries"
										required
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									>
										<option value="3">Best of 3</option>
										<option value="5">Best of 5</option>
										<option value="7">Best of 7</option>
									</select>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Match Date/Time (Optional)</label>
									<input
										type="datetime-local"
										name="matchDateTime"
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									/>
								</div>

								<div>
									<label class="block text-sm font-medium text-gray-300 mb-2">Map Ban Pool (Optional)</label>
									<select
										name="mapBanPoolId"
										class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
									>
										<option value="">No map bans</option>
										{#each data.mapBanPools as pool}
											<option value={pool.id}>{pool.name}</option>
										{/each}
									</select>
								</div>

								<div class="pt-4 flex space-x-3">
									<button
										type="button"
										onclick={() => (wizardStep = 1)}
										class="flex-1 bg-zinc-700 text-white px-6 py-3 rounded-lg hover:bg-zinc-600 transition"
									>
										Back
									</button>
									<button
										type="submit"
										class="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
									>
										Create Matches
									</button>
								</div>
							</div>
						</form>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Edit Match Modal -->
	{#if showEditModal && editingMatch}
		<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg max-w-lg w-full">
				<div class="p-6 border-b border-zinc-800 flex items-center justify-between">
					<h3 class="text-xl font-bold text-white">Edit Match #{editingMatch.id}</h3>
					<button onclick={() => (showEditModal = false)} class="text-gray-400 hover:text-white">
						✕
					</button>
				</div>

				<div class="p-6 space-y-6">
					<!-- Update Status -->
					<form method="POST" action="?/updateMatchStatus" use:enhance>
						<input type="hidden" name="matchId" value={editingMatch.id} />
						<div>
							<label class="block text-sm font-medium text-gray-300 mb-2">Match Status</label>
							<select
								name="status"
								class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2"
							>
								<option value="0" selected={editingMatch.status === 'UNPLAYED'}>Unplayed</option>
								<option value="1" selected={editingMatch.status === 'PLAYED'}>Played</option>
								<option value="2" selected={editingMatch.status === 'DISPUTE'}>Disputed</option>
							</select>
						</div>
						<button
							type="submit"
							class="mt-3 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
						>
							Update Status
						</button>
					</form>

					<div class="border-t border-zinc-800"></div>

					<!-- View Match -->
					<a
						href="/matches/{editingMatch.id}"
						class="block w-full bg-zinc-700 text-white px-4 py-2 rounded-lg hover:bg-zinc-600 transition text-center"
					>
						View Full Match Page
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
