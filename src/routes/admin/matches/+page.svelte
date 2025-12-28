<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Check for success message from create page redirect
	const createdCount = $derived($page.url.searchParams.get('created'));

	// Current filter values
	let selectedRegion = $state(data.filters.regionId || '');
	let selectedSeason = $state(data.filters.seasonId || '');
	let selectedWeek = $state(data.filters.week || '1');

	function onRegionChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		selectedRegion = select.value;
		selectedSeason = ''; // Reset season when region changes
		applyFilters();
	}

	function onSeasonChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		selectedSeason = select.value;
		applyFilters();
	}

	function onWeekChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		selectedWeek = select.value;
		applyFilters();
	}

	function applyFilters() {
		const params = new URLSearchParams();
		if (selectedRegion) params.set('regionId', selectedRegion);
		if (selectedSeason) params.set('seasonId', selectedSeason);
		if (selectedWeek) params.set('week', selectedWeek);
		goto(`/admin/matches?${params.toString()}`);
	}

	function formatMatchDate(dateTime: string | Date | null): string {
		if (!dateTime) return '-';
		const date = new Date(dateTime);
		return date.toLocaleDateString('en-US', {
			month: '2-digit',
			day: '2-digit',
			year: 'numeric'
		}) + ' ' + date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
			timeZoneName: 'short'
		});
	}

	function getMatchTitle(match: any): string {
		const divisionName = match.homeTeam?.division?.name || '';
		
		if (match.playoffRound) {
			const playoffName = match.playoff?.name || 'Playoffs';
			if (match.playoffRound === 4) return `${playoffName} - Grand Finals`;
			if (match.playoffRound === 3) return `${playoffName} - Semifinals`;
			if (match.playoffRound === 2) return `${playoffName} - Quarterfinals`;
			return `${playoffName} - Round ${match.playoffRound}`;
		}
		
		// Format: "Week 1A - Invite" or "Week 1 - Invite"
		const weekLabel = match.weekLabel || match.weekNo;
		return `Week ${weekLabel} - ${divisionName}`;
	}

	function getScoreDisplay(match: any): string {
		if (match.winnerId) {
			// Determine which team won and format score correctly
			const homeWon = match.winnerId === match.homeTeamId;
			const homeScore = homeWon ? match.winnerScore : match.loserScore;
			const awayScore = homeWon ? match.loserScore : match.winnerScore;
			return `${homeScore} - ${awayScore}`;
		}
		return '-';
	}

	function getWinnerClass(match: any, teamId: number): string {
		if (!match.winnerId) return '';
		return match.winnerId === teamId ? 'font-bold' : 'opacity-60';
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-3xl font-bold text-white mb-2">Match Management</h2>
			<p class="text-gray-400">View and manage league matches by week</p>
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
						The matches are now visible in the list below.
					</p>
				</div>
				<a 
					href="/admin/matches?regionId={selectedRegion}&seasonId={selectedSeason}&week={selectedWeek}" 
					class="text-green-400 hover:text-green-300 text-sm"
				>
					Dismiss
				</a>
			</div>
		</div>
	{/if}

	<!-- Filters - Region, Season, Week Selection -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
			<!-- Region Selector -->
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Region</label>
				<select
					value={selectedRegion}
					onchange={onRegionChange}
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					{#each data.regions as region}
						<option value={region.id.toString()}>
							{region.name}
						</option>
					{/each}
				</select>
			</div>

			<!-- Season Selector -->
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Season</label>
				<select
					value={selectedSeason}
					onchange={onSeasonChange}
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					{#each data.seasons as season}
						<option value={season.id.toString()}>
							Season {season.seasonNum}
						</option>
					{/each}
				</select>
			</div>

			<!-- Week/Round Selector -->
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Round</label>
				<select
					value={selectedWeek}
					onchange={onWeekChange}
					class="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				>
					{#each data.weekOptions as option}
						<option value={option.value}>{option.label}</option>
					{/each}
					{#if data.weekOptions.length === 0}
						<option value="1">Week 1</option>
						<option value="2">Week 2</option>
						<option value="3">Week 3</option>
						<option value="4">Week 4</option>
						<option value="5">Week 5</option>
						<option value="6">Week 6</option>
						<option value="7">Week 7</option>
						<option value="8">Week 8</option>
					{/if}
				</select>
			</div>
		</div>
	</div>

	<!-- Matches by Division -->
	{#if data.matchesByDivision.length === 0}
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
			<p class="text-gray-400 text-lg">No matches found for the selected filters</p>
			<p class="text-gray-500 mt-2">Try selecting a different week or season</p>
		</div>
	{:else}
		{#each data.matchesByDivision as division}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
				<!-- Division Header -->
				<div class="bg-zinc-800 px-6 py-4 border-b border-zinc-700">
					<h3 class="text-xl font-bold text-white text-center">{division.name}</h3>
				</div>

				<!-- Match Table -->
				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-zinc-800/50">
							<tr>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Match</th>
								<th class="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Map(s)</th>
								<th class="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Match Date</th>
								<th class="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Home Team</th>
								<th class="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">Points</th>
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Away Team</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800">
							{#each division.matches as match}
								<tr class="hover:bg-zinc-800/30 transition-colors">
									<!-- Match Name -->
									<td class="px-4 py-4">
										<a 
											href="/matches/{match.id}" 
											class="text-blue-400 hover:text-blue-300 hover:underline"
										>
											{getMatchTitle(match)}
										</a>
									</td>

									<!-- Maps -->
									<td class="px-4 py-4">
										<div class="flex items-center justify-center gap-1">
											{#each match.games as game}
												{#if game.arena}
													<div class="relative group">
														{#if game.arena.avatar}
															<img 
																src={game.arena.avatar} 
																alt={game.arena.name}
																class="w-8 h-8 rounded object-cover"
																title={game.arena.name}
															/>
														{:else}
															<div 
																class="w-8 h-8 rounded bg-zinc-700 flex items-center justify-center text-xs text-gray-400"
																title={game.arena.name}
															>
																{game.arena.name.slice(0, 2).toUpperCase()}
															</div>
														{/if}
													</div>
												{:else}
													<div class="w-8 h-8 rounded bg-zinc-700/50 flex items-center justify-center text-xs text-gray-500">
														?
													</div>
												{/if}
											{/each}
											{#if match.games.length === 0}
												<span class="text-gray-500 text-sm">-</span>
											{/if}
										</div>
									</td>

									<!-- Match Date -->
									<td class="px-4 py-4 text-center text-sm text-gray-300">
										{formatMatchDate(match.matchDateTime)}
									</td>

									<!-- Home Team -->
									<td class="px-4 py-4 text-right">
										<a 
											href="/teams/{match.homeTeam.id}" 
											class="text-orange-400 hover:text-orange-300 hover:underline {getWinnerClass(match, match.homeTeamId)}"
										>
											{match.homeTeam.name}
										</a>
									</td>

									<!-- Score -->
									<td class="px-4 py-4 text-center">
										<span class="text-white font-semibold">{getScoreDisplay(match)}</span>
									</td>

									<!-- Away Team -->
									<td class="px-4 py-4 text-left">
										<a 
											href="/teams/{match.awayTeam.id}" 
											class="text-orange-400 hover:text-orange-300 hover:underline {getWinnerClass(match, match.awayTeamId)}"
										>
											{match.awayTeam.name}
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Division Footer -->
				<div class="px-6 py-3 bg-zinc-800/30 border-t border-zinc-700 text-center">
					<span class="text-sm text-gray-400">
						{division.matches.length} match{division.matches.length === 1 ? '' : 'es'}
					</span>
				</div>
			</div>
		{/each}
	{/if}
</div>
