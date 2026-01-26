<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data }: { data: PageData } = $props();

	// Form state
	let isPlayoff = $state(false);
	let selectedRegionId = $state<number | null>(null);
	let selectedDivisionId = $state<number | null>(null);
	let selectedSeasonId = $state<number | null>(null);
	let weekNo = $state<number | null>(null);
	let boSeries = $state(1);
	let selectedArenaId = $state<number | null>(null);
	let matchDateTime = $state('');
	let mapBanPoolId = $state<number | null>(null);
	let playoffRound = $state<number | null>(null);
	let boGames = $state<number | null>(null);

	// Preview state
	let previewMatchups = $state<any[]>([]);
	let previewByeTeam = $state<any | null>(null);
	let weekLabel = $state<string | null>(null);
	let existingMatchSetsCount = $state(0);
	let showPreview = $state(false);
	
	// Loading state
	let isCreating = $state(false);

	// Computed values
	const selectedSeason = $derived(
		selectedSeasonId ? data.seasons.find((s) => s.id === selectedSeasonId) : null
	);

	// Only show regions that have at least one season
	const regionsWithSeasons = $derived(
		data.regions.filter((r) => data.seasons.some((s) => s.regionId === r.id))
	);

	const seasonsForRegion = $derived(
		selectedRegionId ? data.seasons.filter((s) => s.regionId === selectedRegionId) : []
	);

	// Filter divisions by selected region
	const divisionsForRegion = $derived(
		selectedRegionId ? data.divisions.filter((d) => d.regionId === selectedRegionId) : []
	);

	const canPreview = $derived(
		selectedRegionId && selectedDivisionId && selectedSeasonId && (isPlayoff ? playoffRound : weekNo)
	);

	// Get playoff data for selected season
	const selectedSeasonPlayoff = $derived(
		selectedSeasonId ? data.playoffs?.find((p) => p.seasonId === selectedSeasonId) : null
	);

	// Generate playoff rounds for selector
	const playoffRounds = $derived.by(() => {
		if (!selectedSeasonPlayoff) return [];
		
		const rounds: { value: number; label: string }[] = [];
		
		// Upper bracket rounds (positive numbers)
		if (selectedSeasonPlayoff.numRounds) {
			for (let i = 1; i <= selectedSeasonPlayoff.numRounds; i++) {
				rounds.push({
					value: i,
					label: `Upper Round ${i}`
				});
			}
			
			// Lower bracket rounds (negative numbers) if double elimination
			if (selectedSeasonPlayoff.doubleElim === 1) {
				for (let i = 1; i <= selectedSeasonPlayoff.numRounds * 2; i++) {
					rounds.push({
						value: -i,
						label: `Lower Round ${i}`
					});
				}
			}
		}
		
		return rounds;
	});

	// Preview data
	let previewTeams = $state<any[]>([]);

	// Handle preview form submission
	const handlePreviewEnhance = () => {
		return async ({ result, update }: any) => {
			if (result.type === 'success' && result.data && 'preview' in result.data) {
				const preview = (result.data as any).preview;
				previewMatchups = preview.matchups || [];
				previewByeTeam = preview.byeTeam || null;
				previewTeams = preview.teams || [];
				weekLabel = preview.weekLabel || null;
				existingMatchSetsCount = preview.existingCount || 0;
				showPreview = true;

				console.log('Preview loaded:', {
					matchups: previewMatchups.length,
					byeTeam: previewByeTeam?.name,
					teams: previewTeams.length,
					weekLabel,
					existingMatchSetsCount,
					isPlayoff: preview.isPlayoff
				});
			} else if (result.type === 'failure') {
				alert(`Error: ${result.data?.error || 'Failed to preview matches'}`);
			}
			// Don't call update() - prevents form reset
		};
	};

	// Handle create form submission
	const handleCreateEnhance = () => {
		isCreating = true;
		
		return async ({ result, update }: any) => {
			console.log('Create form result:', result);
			
			if (result.type === 'failure') {
				console.error('Form submission failed:', result);
				isCreating = false;
				alert(`Error: ${result.data?.error || 'Failed to create matches'}`);
			}
			
			if (result.type === 'redirect') {
				// Keep loading state true during redirect
			} else {
				isCreating = false;
			}
			
			await update();
		};
	};

	// Reset preview when user changes form fields
	function onFieldChange() {
		if (showPreview) {
			showPreview = false;
			previewMatchups = [];
			previewByeTeam = null;
			weekLabel = null;
			existingMatchSetsCount = 0;
		}
	}

	// Reset dependent fields when region changes
	function onRegionChange() {
		selectedDivisionId = null;
		selectedSeasonId = null;
		onFieldChange();
	}
</script>

<div class="max-w-4xl mx-auto space-y-6">
	<h1 class="text-4xl font-bold text-white mb-8">Create Match Set</h1>

	<!-- Main Form -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<form method="POST" action="?/previewMatches" use:enhance={handlePreviewEnhance}>
			<div class="space-y-4">
				<!-- Playoff Match -->
				<div>
					<label class="flex items-center space-x-2 cursor-pointer">
						<input
							type="checkbox"
							name="isPlayoff"
							bind:checked={isPlayoff}
							class="rounded bg-zinc-800 border-zinc-700"
						/>
						<span class="text-gray-300">Playoff Match</span>
					</label>
				</div>

				<!-- Region -->
				<div>
					<label class="block text-sm font-medium text-gray-300 mb-1">Region</label>
					<select
						name="regionId"
						bind:value={selectedRegionId}
						onchange={onRegionChange}
						required
						class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
					>
						<option value="">Select Region</option>
						{#each regionsWithSeasons as region}
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
						onchange={onFieldChange}
						required
						disabled={!selectedRegionId}
						class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<option value="">
							{selectedRegionId ? 'Select Division' : 'Select Region First'}
						</option>
						{#each divisionsForRegion as division}
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
						onchange={onFieldChange}
						required
						disabled={!selectedRegionId}
						class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
					>
					<option value="">
						{selectedRegionId ? 'Select Season' : 'Select Region First'}
					</option>
					{#each seasonsForRegion as season}
						<option value={season.id}>Season {season.seasonNum}</option>
					{/each}
					</select>
				</div>

				<!-- Playoff Round -->
				{#if isPlayoff}
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Playoff Round</label>
						<select
							name="playoffRound"
							bind:value={playoffRound}
							onchange={onFieldChange}
							required
							disabled={!selectedSeasonPlayoff}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<option value="">
								{selectedSeasonPlayoff ? 'Select Round' : 'No playoff configured for this season'}
							</option>
							{#each playoffRounds as round}
								<option value={round.value}>{round.label}</option>
							{/each}
						</select>
						{#if selectedSeasonId && !selectedSeasonPlayoff}
							<p class="text-red-400 text-sm mt-1">
								No playoff configuration found for this season. Please configure playoffs in League Configuration first.
							</p>
						{/if}
					</div>
				{/if}

				<!-- Week Number -->
				{#if !isPlayoff}
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Week Number</label>
						<input
							type="number"
							name="weekNo"
							bind:value={weekNo}
							oninput={onFieldChange}
							required
							min="1"
							max={selectedSeason?.numWeeks || 999}
							disabled={!selectedSeasonId}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
							placeholder={selectedSeasonId
								? `Enter week (1-${selectedSeason?.numWeeks || '?'})`
								: 'Select Season First'}
						/>
						{#if selectedSeason}
							<p class="text-xs text-gray-500 mt-1">
								Season has {selectedSeason.numWeeks} weeks
							</p>
						{/if}
					</div>
				{/if}

				<!-- Arena (Regular Matches Only) -->
				{#if !isPlayoff}
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Arena</label>
						<select
							name="arenaId"
							bind:value={selectedArenaId}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
						>
							<option value="">No Default Arena</option>
							{#each data.arenas as arena}
								<option value={arena.id}>{arena.name}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Optional: Set default arena for all games</p>
					</div>
				{/if}

				<!-- Map Ban Pool (Playoff Matches Only) -->
				{#if isPlayoff}
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Map Ban Pool</label>
						<select
							name="mapBanPoolId"
							bind:value={mapBanPoolId}
							required
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
						>
							<option value="">Select Map Ban Pool</option>
							{#each data.mapBanPools.filter(pool => pool.isActive) as pool}
								<option value={pool.id}>{pool.name}</option>
							{/each}
						</select>
						<p class="text-xs text-gray-500 mt-1">Required: Map ban pool for playoff matches</p>
					</div>
				{/if}

				<!-- Best of Games (Playoff Matches Only) -->
				{#if isPlayoff}
					<div>
						<label class="block text-sm font-medium text-gray-300 mb-1">Best of Games (per Arena)</label>
						<select
							name="boGames"
							bind:value={boGames}
							class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
						>
							<option value="">Default (1 game per arena)</option>
							<option value={1}>1</option>
							<option value={3}>3</option>
							<option value={5}>5</option>
							<option value={7}>7</option>
						</select>
						<p class="text-xs text-gray-500 mt-1">Optional: Number of games to play on each arena</p>
					</div>
				{/if}

				<!-- Best of Series -->
				<div>
					<label class="block text-sm font-medium text-gray-300 mb-1">Best of Series</label>
					<select
						name="boSeries"
						bind:value={boSeries}
						required
						class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
					>
						<option value={1}>1</option>
						<option value={3}>3</option>
						<option value={5}>5</option>
						<option value={7}>7</option>
					</select>
				</div>

			<!-- Match Date and Time -->
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-1">Match Date and Time (UTC)</label>
				<input
					type="datetime-local"
					name="matchDateTime"
					bind:value={matchDateTime}
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
				/>
				<p class="text-xs text-gray-500 mt-1">
					Optional: Default scheduled time (enter in UTC timezone)
				</p>
			</div>

				<!-- Map Ban Pool (Hidden for now, can add later) -->
				<input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />

				<!-- Preview Button -->
				<button
					type="submit"
					disabled={!canPreview}
					class="w-full bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
				>
					Preview Match Set
				</button>
			</div>
		</form>
	</div>

	<!-- Preview Section -->
	{#if showPreview}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h2 class="text-2xl font-bold text-white mb-4">Match Preview</h2>

			{#if weekLabel && !isPlayoff}
				<div class="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
					<p class="text-blue-300 text-sm">
						This will create <strong class="text-white">Week {weekLabel}</strong>
						{#if existingMatchSetsCount > 0}
							({existingMatchSetsCount} existing match set{existingMatchSetsCount === 1
								? ''
								: 's'} for this week)
						{/if}
					</p>
				</div>
			{/if}

			{#if previewMatchups.length === 0}
				<div class="text-center py-8">
					<p class="text-gray-400">No eligible teams found for this configuration.</p>
					<p class="text-sm text-gray-500 mt-2">
						Teams must have status READY and be in the selected division/region.
					</p>
				</div>
			{:else if isPlayoff}
				<!-- Playoff Match Selection -->
				<form method="POST" action="?/createMatchSet" use:enhance={handleCreateEnhance} class="space-y-4">
					<!-- Hidden fields for playoff match creation -->
					<input type="hidden" name="regionId" value={selectedRegionId} />
					<input type="hidden" name="divisionId" value={selectedDivisionId} />
					<input type="hidden" name="seasonId" value={selectedSeasonId} />
					<input type="hidden" name="boSeries" value={boSeries} />
					<input type="hidden" name="matchDateTime" value={matchDateTime} />
					<input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />
					<input type="hidden" name="isPlayoff" value="on" />
					<input type="hidden" name="playoffRound" value={playoffRound || ''} />
					<input type="hidden" name="boGames" value={boGames || ''} />

					<div class="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
						<p class="text-purple-300 text-sm">
							<strong class="text-white">Playoff Round {playoffRound && playoffRound > 0 ? playoffRound : `Lower ${Math.abs(playoffRound || 0)}`}</strong>
							- Select teams manually for each matchup
						</p>
					</div>

					<p class="text-gray-300 mb-4">
						<span class="font-semibold text-white">{previewMatchups.length} matches</span> will be created. Select teams for each matchup:
					</p>

					<!-- Manual Team Selection for Playoffs -->
					<div class="space-y-4">
						{#each previewMatchups as matchup, i}
							<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
								<h4 class="text-white font-semibold mb-3">Match {i + 1}</h4>
								<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
									<!-- Home Team Selection -->
									<div>
										<label class="block text-sm font-medium text-gray-300 mb-2">Home Team</label>
										<select 
											name="homeTeamIds"
											class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
											required
										>
											<option value="">Select Home Team</option>
											{#each previewTeams as team}
												<option value={team.id}>
													{team.name} (Seed #{team.seed}, {team.wins}-{team.losses})
												</option>
											{/each}
										</select>
									</div>

									<!-- Away Team Selection -->
									<div>
										<label class="block text-sm font-medium text-gray-300 mb-2">Away Team</label>
										<select 
											name="awayTeamIds"
											class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
											required
										>
											<option value="">Select Away Team</option>
											{#each previewTeams as team}
												<option value={team.id}>
													{team.name} (Seed #{team.seed}, {team.wins}-{team.losses})
												</option>
											{/each}
										</select>
									</div>
								</div>
							</div>
						{/each}
					</div>

					<!-- Create Button for Playoffs -->
					<button
						type="submit"
						disabled={isCreating}
						class="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold mt-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
					>
						{isCreating ? 'Creating...' : `Create ${previewMatchups.length} Playoff Match${previewMatchups.length === 1 ? '' : 'es'}`}
					</button>
				</form>
			{:else}
				<div class="space-y-4">
					<p class="text-gray-300 mb-4">
						<span class="font-semibold text-white">{previewMatchups.length} matches</span> will be created:
					</p>

					<!-- Matchups Table -->
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr class="border-b border-zinc-700">
									<th class="text-left py-3 px-4 text-sm font-semibold text-gray-300">Home</th>
									<th class="text-center py-3 px-4 text-sm font-semibold text-gray-300"></th>
									<th class="text-left py-3 px-4 text-sm font-semibold text-gray-300">Away</th>
								</tr>
							</thead>
							<tbody>
								{#each previewMatchups as matchup, i}
									<tr class="border-b border-zinc-800 hover:bg-zinc-800/50">
										<!-- Home Team -->
										<td class="py-3 px-4">
											<div class="flex flex-col">
												<span class="text-white font-semibold">{matchup.home.name}</span>
												<span class="text-xs text-gray-400">
													Seed #{matchup.home.seed} • {matchup.home.wins}-{matchup.home.losses}
												</span>
											</div>
										</td>
										
										<!-- VS -->
										<td class="py-3 px-4 text-center">
											<span class="text-gray-500 text-sm">vs</span>
										</td>
										
										<!-- Away Team -->
										<td class="py-3 px-4">
											<div class="flex flex-col">
												<span class="text-white font-semibold">{matchup.away.name}</span>
												<span class="text-xs text-gray-400">
													Seed #{matchup.away.seed} • {matchup.away.wins}-{matchup.away.losses}
												</span>
											</div>
										</td>
									</tr>
								{/each}
								
								<!-- Bye Team Row -->
								{#if previewByeTeam}
									<tr class="border-b border-zinc-800 bg-yellow-500/10">
										<!-- Bye Team -->
										<td class="py-3 px-4">
											<div class="flex flex-col">
												<span class="text-white font-semibold">{previewByeTeam.name}</span>
												<span class="text-xs text-gray-400">
													Seed #{previewByeTeam.seed} • {previewByeTeam.wins}-{previewByeTeam.losses}
												</span>
											</div>
										</td>
										
										<!-- VS -->
										<td class="py-3 px-4 text-center">
											<span class="text-gray-500 text-sm">vs</span>
										</td>
										
										<!-- BYE -->
										<td class="py-3 px-4">
											<div class="flex flex-col">
												<span class="text-yellow-400 font-bold">BYE</span>
												<span class="text-xs text-yellow-300">Receives bye week</span>
											</div>
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>

					<!-- Create Button -->
					<form method="POST" action="?/createMatchSet" use:enhance={handleCreateEnhance}>
						<!-- Pass all form data as hidden fields -->
						<input type="hidden" name="regionId" value={selectedRegionId} />
						<input type="hidden" name="divisionId" value={selectedDivisionId} />
						<input type="hidden" name="seasonId" value={selectedSeasonId} />
						<input type="hidden" name="weekNo" value={weekNo || ''} />
						<input type="hidden" name="boSeries" value={boSeries} />
						<input type="hidden" name="arenaId" value={selectedArenaId || ''} />
						<input type="hidden" name="matchDateTime" value={matchDateTime} />
						<input type="hidden" name="mapBanPoolId" value={mapBanPoolId || ''} />
						{#if isPlayoff}
							<input type="hidden" name="isPlayoff" value="on" />
							<input type="hidden" name="playoffRound" value={playoffRound || ''} />
							<input type="hidden" name="boGames" value={boGames || ''} />
						{/if}

						<button
							type="submit"
							disabled={isCreating}
							class="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold mt-6 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
						>
							{isCreating ? 'Creating...' : `Create ${previewMatchups.length} Match${previewMatchups.length === 1 ? '' : 'es'}`}
						</button>
					</form>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Loading Modal -->
{#if isCreating}
	<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-8 flex flex-col items-center space-y-4">
			<!-- Spinner -->
			<div class="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
			
			<!-- Text -->
			<div class="text-center">
				<p class="text-xl font-semibold text-white">Creating matches...</p>
				<p class="text-sm text-gray-400 mt-2">Please wait while we create your match set</p>
			</div>
		</div>
	</div>
{/if}
