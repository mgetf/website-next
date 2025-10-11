<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	// Wizard state
	let wizardStep = $state(1);
	let creationType = $state<'matchSet' | 'specificMatch' | null>(null);

	// Step 2: Configuration
	let selectedSeasonId = $state<number | null>(null);
	let selectedRegionId = $state<number | null>(null);
	let selectedDivisionId = $state<number | null>(null);
	let selectedWeekNo = $state<number | null>(null);
	let isPlayoff = $state(false);

	// Step 3: Preview
	let previewTeams = $state<any[]>([]);
	let previewMatchups = $state<any[]>([]);
	let previewByeTeam = $state<any | null>(null);

	// Step 4: Final details
	let seasonNo = $state<number | null>(null);
	let weekNo = $state<number | null>(null);
	let boSeries = $state<number>(3);
	let selectedArenaId = $state<number | null>(null);
	let matchDateTime = $state<string>('');
	let selectedMapBanPoolId = $state<number | null>(null);

	// Handle preview form submission
	const handlePreviewEnhance = () => {
		return async ({ result, update }: any) => {
			if (result.type === 'success' && result.data && 'preview' in result.data) {
				const preview = (result.data as any).preview;
				previewTeams = preview.teams || [];
				previewMatchups = preview.matchups || [];
				previewByeTeam = preview.byeTeam || null;
				wizardStep = 3;
			}
			await update();
		};
	};

	// Handle create form submission
	const handleCreateEnhance = () => {
		return async ({ result, update }: any) => {
			if (result.type === 'redirect') {
				// Will redirect automatically
			}
			await update();
		};
	};
</script>

<div class="max-w-4xl mx-auto space-y-8">
	<h1 class="text-4xl font-bold text-white mb-8">Create Matches</h1>

	<!-- Step 1: Choose Creation Type -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<h2 class="text-xl font-bold text-white mb-4">Step 1: Choose Creation Type</h2>

		{#if wizardStep >= 1}
			<div class="space-y-4">
				<p class="text-gray-300">
					What type of match creation would you like to perform?
				</p>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<button
						type="button"
						onclick={() => (creationType = 'matchSet')}
						class="p-6 border-2 rounded-lg transition-all {creationType === 'matchSet'
							? 'border-blue-500 bg-blue-500/10'
							: 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'}"
					>
						<div class="text-left">
							<h3 class="text-lg font-semibold text-white mb-2">Match Set</h3>
							<p class="text-sm text-gray-400">
								Create multiple matches for all teams in a division/week. Best for regular season.
							</p>
						</div>
					</button>

					<button
						type="button"
						onclick={() => (creationType = 'specificMatch')}
						class="p-6 border-2 rounded-lg transition-all border-zinc-700 bg-zinc-800 opacity-50 cursor-not-allowed"
						disabled
					>
						<div class="text-left">
							<h3 class="text-lg font-semibold text-white mb-2">
								Specific Match <span class="text-xs text-gray-500">(Coming Soon)</span>
							</h3>
							<p class="text-sm text-gray-400">
								Create a single match between two specific teams. Best for playoffs or makeups.
							</p>
						</div>
					</button>
				</div>

				{#if creationType}
					<div class="flex justify-end mt-4">
						<button
							type="button"
							onclick={() => (wizardStep = 2)}
							class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
						>
							Next
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Step 2: Select Configuration -->
	{#if wizardStep >= 2}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h2 class="text-xl font-bold text-white mb-4">Step 2: Select Configuration</h2>

			<form method="POST" action="?/previewMatches" use:enhance={handlePreviewEnhance}>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<!-- Region -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Region</label>
						<select
							name="regionId"
							bind:value={selectedRegionId}
							required
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value="">Select Region</option>
							{#each data.regions as region}
								<option value={region.id}>{region.name}</option>
							{/each}
						</select>
					</div>

					<!-- Division -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Division</label>
						<select
							name="divisionId"
							bind:value={selectedDivisionId}
							required
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value="">Select Division</option>
							{#each data.divisions as division}
								<option value={division.id}>{division.name}</option>
							{/each}
						</select>
					</div>

					<!-- Season -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Season</label>
						<select
							name="seasonId"
							bind:value={selectedSeasonId}
							required
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value="">Select Season</option>
							{#each data.seasons as season}
								<option value={season.id}>Season {season.seasonNum} - {season.region.name}</option>
							{/each}
						</select>
					</div>

					<!-- Week -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Week Number</label>
						<input
							type="number"
							name="weekNo"
							bind:value={selectedWeekNo}
							min="1"
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
							placeholder="Optional"
						/>
						<p class="text-xs text-gray-500 mt-1">
							Leave empty if creating playoff matches
						</p>
					</div>

					<!-- Playoff -->
					<div class="col-span-full">
						<label class="flex items-center space-x-2 cursor-pointer">
							<input
								type="checkbox"
								name="isPlayoff"
								bind:checked={isPlayoff}
								class="rounded bg-zinc-800 border-zinc-700"
							/>
							<span class="text-gray-300">This is a playoff match set</span>
						</label>
					</div>
				</div>

				<div class="flex justify-between mt-6">
					<button
						type="button"
						onclick={() => (wizardStep = 1)}
						class="bg-zinc-700 text-white px-6 py-2 rounded-lg hover:bg-zinc-600 transition"
					>
						Back
					</button>
					<button
						type="submit"
						class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
					>
						Preview Match Set
					</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Step 3: Preview Match Set -->
	{#if wizardStep >= 3}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h2 class="text-xl font-bold text-white mb-4">Step 3: Preview Match Set</h2>

			{#if previewTeams.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-400">No eligible teams found for this configuration.</p>
					<p class="text-sm text-gray-500 mt-2">
						Teams must have status READY and be in the selected division/region/season.
					</p>
				</div>
			{:else}
				<div class="space-y-6">
					<div>
						<p class="text-gray-300 mb-1">
							Found <span class="font-semibold text-white">{previewTeams.length} eligible teams</span>
						</p>
						<p class="text-sm text-gray-500">
							The following <span class="font-semibold text-white">{previewMatchups.length} matches</span> will be created:
						</p>
					</div>

					<!-- Matchups -->
					<div class="space-y-3">
						{#each previewMatchups as matchup, i}
							<div class="bg-zinc-800 rounded-lg p-4">
								<div class="flex items-center justify-between gap-4">
									<!-- Home Team -->
									<div class="flex-1 text-right">
										<div class="flex items-center justify-end gap-3">
											<div class="flex flex-col items-end">
												<span class="text-white font-semibold">{matchup.home.name}</span>
												<span class="text-xs text-gray-400">
													Seed #{matchup.home.seed} • {matchup.home.wins}W - {matchup.home.losses}L
												</span>
											</div>
											<div
												class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold"
											>
												{matchup.home.seed}
											</div>
										</div>
									</div>

									<!-- VS Badge -->
									<div class="flex-shrink-0">
										<div
											class="bg-zinc-700 text-gray-300 px-3 py-1 rounded font-bold text-sm"
										>
											VS
										</div>
									</div>

									<!-- Away Team -->
									<div class="flex-1 text-left">
										<div class="flex items-center gap-3">
											<div
												class="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white font-bold"
											>
												{matchup.away.seed}
											</div>
											<div class="flex flex-col items-start">
												<span class="text-white font-semibold">{matchup.away.name}</span>
												<span class="text-xs text-gray-400">
													Seed #{matchup.away.seed} • {matchup.away.wins}W - {matchup.away.losses}L
												</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Bye Team Warning -->
					{#if previewByeTeam}
						<div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
							<div class="flex items-start gap-3">
								<span class="text-2xl">⚠️</span>
								<div>
									<p class="text-yellow-400 font-semibold">Bye Week</p>
									<p class="text-yellow-300 text-sm mt-1">
										<strong>{previewByeTeam.name}</strong> (Seed #{previewByeTeam.seed}) will receive a bye
										this week due to odd number of teams.
									</p>
								</div>
							</div>
						</div>
					{/if}

					<!-- Info Note -->
					<div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
						<p class="text-blue-300 text-sm">
							<strong>Note:</strong> Matches are created using the pairing algorithm that avoids
							repeat matchups when possible. The algorithm considers previous matches in this season.
						</p>
					</div>

					<div class="flex justify-between mt-6">
						<button
							type="button"
							onclick={() => (wizardStep = 2)}
							class="bg-zinc-700 text-white px-6 py-2 rounded-lg hover:bg-zinc-600 transition"
						>
							Back
						</button>
						<button
							type="button"
							onclick={() => (wizardStep = 4)}
							class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
						>
							Continue to Create
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Step 4: Final Details and Create -->
	{#if wizardStep >= 4}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h2 class="text-xl font-bold text-white mb-4">Step 4: Final Details and Create</h2>

			<form method="POST" action="?/createMatchSet" use:enhance={handleCreateEnhance}>
				<!-- Hidden fields to pass configuration from step 2 -->
				<input type="hidden" name="regionId" value={selectedRegionId} />
				<input type="hidden" name="divisionId" value={selectedDivisionId} />
				<input type="hidden" name="seasonId" value={selectedSeasonId} />
				<input type="hidden" name="isPlayoff" value={isPlayoff} />

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<!-- Season Number -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Season Number</label>
						<input
							type="number"
							name="seasonNo"
							bind:value={seasonNo}
							required
							min="1"
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
							placeholder="e.g., 15"
						/>
						<p class="text-xs text-gray-500 mt-1">Display season number (e.g., 15 for Season 15)</p>
					</div>

					<!-- Week Number -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Week Number</label>
						<input
							type="number"
							name="weekNo"
							bind:value={weekNo}
							min="1"
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
							placeholder="Optional for playoffs"
						/>
						<p class="text-xs text-gray-500 mt-1">Leave empty for playoff matches</p>
					</div>

					<!-- BO Series -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Best-of Series</label>
						<select
							name="boSeries"
							bind:value={boSeries}
							required
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value={1}>BO1 (1 game)</option>
							<option value={3}>BO3 (best of 3)</option>
							<option value={5}>BO5 (best of 5)</option>
						</select>
					</div>

					<!-- Default Arena -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Default Arena</label>
						<select
							name="arenaId"
							bind:value={selectedArenaId}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value="">No default</option>
							{#each data.arenas as arena}
								<option value={arena.id}>{arena.name}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Optional: Set a default arena for all games</p>
					</div>

					<!-- Match Date/Time -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Match Date/Time</label>
						<input
							type="datetime-local"
							name="matchDateTime"
							bind:value={matchDateTime}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						/>
						<p class="text-xs text-gray-500 mt-1">Optional: Default scheduled time</p>
					</div>

					<!-- Map Ban Pool -->
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Map Ban Pool</label>
						<select
							name="mapBanPoolId"
							bind:value={selectedMapBanPoolId}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2"
						>
							<option value="">No map bans</option>
							{#each data.mapBanPools as pool}
								<option value={pool.id}>{pool.name} ({pool.mapsInPool?.length || 0} maps)</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Optional: Enable map ban/pick phase</p>
					</div>
				</div>

				<div class="flex justify-between mt-6">
					<button
						type="button"
						onclick={() => (wizardStep = 3)}
						class="bg-zinc-700 text-white px-6 py-2 rounded-lg hover:bg-zinc-600 transition"
					>
						Back
					</button>
					<button
						type="submit"
						class="bg-green-600 text-white px-8 py-2 rounded-lg hover:bg-green-700 transition font-semibold"
					>
						Create {previewMatchups.length} Match{previewMatchups.length === 1 ? '' : 'es'}
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>
