<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import type { PageData } from './$types';
import DataTable from '$lib/components/ui/DataTable.svelte';
import SelectFilter from '$lib/components/ui/SelectFilter.svelte';

let { data }: { data: PageData } = $props();

const matchColumns = [
	{ key: 'match', label: 'Match' },
	{ key: 'maps', label: 'Map(s)', align: 'center' as const },
	{ key: 'date', label: 'Match Date', align: 'center' as const },
	{ key: 'home', label: 'Home Team', align: 'right' as const },
	{ key: 'score', label: 'Points', align: 'center' as const },
	{ key: 'away', label: 'Away Team' }
];

// Check for success message from create page redirect
const createdCount = $derived($page.url.searchParams.get('created'));

// Current filter values
let selectedRegion = $state(data.filters.regionId || '');
let selectedSeason = $state(data.filters.seasonId || '');
let selectedWeek = $state(data.filters.week || '1');

const regionOptions = $derived(
  data.regions.map((r) => ({ value: r.id.toString(), label: r.name }))
);

const seasonOptions = $derived(
  data.seasons.map((s) => ({ value: s.id.toString(), label: `Season ${s.seasonNum}` }))
);

const weekOptions = $derived(
  data.weekOptions.length > 0
    ? data.weekOptions.map((o) => ({ value: o.value, label: o.label }))
    : [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: n.toString(), label: `Week ${n}` }))
);

function onRegionChange(value: string) {
  selectedRegion = value;
  selectedSeason = '';
  applyFilters();
}

function onSeasonChange(value: string) {
  selectedSeason = value;
  applyFilters();
}

function onWeekChange(value: string) {
  selectedWeek = value;
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
  return (
    date.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }) +
    ' ' +
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    })
  );
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
			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Region</label>
				<SelectFilter
					value={selectedRegion}
					options={regionOptions}
					showAllOption={false}
					onChange={onRegionChange}
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Season</label>
				<SelectFilter
					value={selectedSeason}
					options={seasonOptions}
					showAllOption={false}
					onChange={onSeasonChange}
				/>
			</div>

			<div>
				<label class="block text-sm font-medium text-gray-300 mb-2">Round</label>
				<SelectFilter
					value={selectedWeek}
					options={weekOptions}
					showAllOption={false}
					onChange={onWeekChange}
				/>
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
				<DataTable data={division.matches} columns={matchColumns}>
					{#snippet cell(match, col)}
						{#if col.key === 'match'}
							<a 
								href="/matches/{match.id}" 
								class="text-blue-400 hover:text-blue-300 hover:underline"
							>
								{getMatchTitle(match)}
							</a>
						{:else if col.key === 'maps'}
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
						{:else if col.key === 'date'}
							<span class="text-sm text-gray-300">{formatMatchDate(match.matchDateTime)}</span>
						{:else if col.key === 'home'}
							<a 
								href="/teams/{match.homeTeam.id}" 
								class="text-orange-400 hover:text-orange-300 hover:underline {getWinnerClass(match, match.homeTeamId)}"
							>
								{match.homeTeam.name}
							</a>
						{:else if col.key === 'score'}
							<span class="text-white font-semibold">{getScoreDisplay(match)}</span>
						{:else if col.key === 'away'}
							<a 
								href="/teams/{match.awayTeam.id}" 
								class="text-orange-400 hover:text-orange-300 hover:underline {getWinnerClass(match, match.awayTeamId)}"
							>
								{match.awayTeam.name}
							</a>
						{/if}
					{/snippet}
				</DataTable>

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
