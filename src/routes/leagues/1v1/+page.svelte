<script lang="ts">
import { goto } from '$app/navigation';

interface PageData {
  seasons: Array<{
    id: number;
    name: string;
    seasonNum: number;
    regionId: number;
  }>;
  regions: Array<{ id: number; name: string }>;
  selectedSeasonId: number;
  selectedRegionId: number;
  selectedRegionName: string;
  selectedSeasonNum: number;
  entriesByDivision: Array<{
    division: { id: number; name: string };
    entries: Array<{
      id: number;
      teamId: number;
      name: string;
      avatar: string | null;
      steamId: string | null;
      wins: number;
      losses: number;
      points: number;
      isWithdrawn?: boolean;
    }>;
  }>;
  deadlines: {
    signupClosed: boolean;
    rosterLocked: boolean;
    paymentRequired: boolean;
  };
}

let { data } = $props<{ data: PageData }>();

// Track selected season and region in state
let selectedSeason = $state(data.selectedSeasonId);
let selectedRegion = $state(data.selectedRegionId);
let isInitialized = $state(false);

// Auto-switch to valid season when region changes
$effect(() => {
  const seasonsForRegion = data.seasons.filter(
    (s: (typeof data.seasons)[number]) => s.regionId === selectedRegion,
  );
  if (
    !seasonsForRegion.find(
      (s: (typeof data.seasons)[number]) => s.id === selectedSeason,
    )
  ) {
    selectedSeason = seasonsForRegion[0]?.id || data.selectedSeasonId;
  }
});

// Navigate when season or region changes (after initial load)
$effect(() => {
  if (!isInitialized) {
    isInitialized = true;
    return;
  }

  const params = new URLSearchParams();
  params.set('season', selectedSeason.toString());
  params.set('region', selectedRegion.toString());
  goto(`?${params.toString()}`, { keepFocus: true, replaceState: false });
});

// Get region abbreviation
function getRegionAbbr(regionId: number): string {
  const region = data.regions.find(
    (r: (typeof data.regions)[number]) => r.id === regionId,
  );
  if (!region) return 'NA';
  if (region.name.toLowerCase().includes('north america')) return 'NA';
  if (region.name.toLowerCase().includes('europe')) return 'EU';
  if (region.name.toLowerCase().includes('south america')) return 'SA';
  if (region.name.toLowerCase().includes('australia')) return 'AUS';
  if (region.name.toLowerCase().includes('asia')) return 'ASIA';
  return region.name.substring(0, 3).toUpperCase();
}

// Filter regions to only show those with 1v1 seasons
const regionsWithSeasons = $derived(
  data.regions.filter((region: (typeof data.regions)[number]) =>
    data.seasons.some(
      (s: (typeof data.seasons)[number]) => s.regionId === region.id,
    ),
  ),
);
</script>

<div class="min-h-screen pb-16">
	<!-- Hero Header -->
	<section class="relative py-16 px-6 text-center bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-7xl mx-auto">
			<h1 class="text-6xl font-black mb-12 text-white drop-shadow-2xl">1v1 MGE League</h1>

			{#if data.seasons.length === 0}
				<p class="text-gray-400 text-lg">No 1v1 seasons have been created yet.</p>
			{:else}
				<!-- Region & Season Controls -->
				<div class="flex items-start justify-center gap-8">
					<div class="flex flex-col items-center gap-2">
						<span class="text-sm font-medium text-gray-400">Region</span>
						<div class="flex gap-2">
							{#each regionsWithSeasons as region}
								<button
									onclick={() => {
										selectedRegion = region.id;
									}}
									class="px-6 py-2 rounded font-medium transition-all {selectedRegion === region.id
										? 'bg-zinc-700 text-white border border-zinc-600'
										: 'bg-zinc-900 text-gray-300 hover:bg-zinc-800 border border-zinc-800'}"
								>
									{getRegionAbbr(region.id)}
								</button>
							{/each}
						</div>
					</div>

					<div class="flex flex-col items-center gap-2">
						<span class="text-sm font-medium text-gray-400">Season</span>
						<select
							bind:value={selectedSeason}
							class="px-6 py-2 bg-zinc-900 text-white rounded border border-zinc-800 hover:bg-zinc-800 transition-all cursor-pointer"
						>
							{#each data.seasons.filter((s: (typeof data.seasons)[number]) => s.regionId === selectedRegion) as season}
								<option value={season.id}>{season.name}</option>
							{/each}
						</select>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Main Content -->
	<div class="max-w-[1400px] mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
			<!-- Left Sidebar - Info -->
			<aside class="lg:col-span-3 space-y-4">
				<!-- Signup Status -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-3">1v1 Signups</h3>
					<div
						class="text-4xl font-black {data.deadlines.signupClosed
							? 'text-red-500'
							: 'text-green-500'} mb-4"
					>
						{data.deadlines.signupClosed ? 'CLOSED' : 'OPEN'}
					</div>
					{#if !data.deadlines.signupClosed}
						<a
							href="/signup/1v1"
							class="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
						>
							Sign Up Now
						</a>
					{/if}
				</div>

				<!-- Info Box -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-3">About 1v1 League</h3>
					<ul class="text-sm text-gray-300 space-y-2">
						<li>&bull; Individual player competition</li>
						<li>&bull; Same match system as 2v2</li>
						<li>&bull; Map bans, demos, scheduling</li>
						<li>&bull; Compete in your skill division</li>
					</ul>
				</div>
			</aside>

			<!-- Center - Standings -->
			<main class="lg:col-span-9 space-y-8">
				{#if data.entriesByDivision.length === 0}
					<div
						class="bg-zinc-900/50 backdrop-blur rounded-lg border border-zinc-800 p-12 text-center"
					>
						<p class="text-gray-400 text-lg">No players found for this season and region.</p>
						<p class="text-gray-500 text-sm mt-2">
							Check back later or select a different season.
						</p>
					</div>
				{:else}
					{#each data.entriesByDivision as divisionData}
						<div
							class="bg-zinc-900/50 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden"
						>
							<!-- Division Header -->
							<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
								<h2 class="text-2xl font-bold text-white uppercase tracking-wide">
									{divisionData.division.name}
									<span class="text-gray-500">({getRegionAbbr(selectedRegion)})</span>
								</h2>
							</div>

							<!-- Standings Table -->
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead class="bg-zinc-950/50">
										<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
											<th class="px-4 py-2 font-medium">Player</th>
											<th class="px-4 py-2 font-medium">Record</th>
											<th class="px-4 py-2 font-medium">Avg Points</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-zinc-800/50">
										{#each divisionData.entries as entry}
											<tr class="hover:bg-zinc-800/30 transition-colors {entry.isWithdrawn ? 'opacity-60' : ''}">
												<td class="px-4 py-2">
													<a
														href={entry.steamId
															? `/users/${entry.steamId}`
															: `/teams/${entry.teamId}`}
														class="flex items-center gap-2 text-sm font-medium hover:text-purple-400 transition-colors {entry.isWithdrawn ? 'text-gray-400' : 'text-white'}"
													>
														<img
															src={entry.avatar ||
																`https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg`}
															alt="{entry.name}"
															class="w-8 h-8 rounded object-cover {entry.isWithdrawn ? 'grayscale' : ''}"
														/>
														<span>{entry.name}</span>
														{#if entry.isWithdrawn}
															<span class="px-1.5 py-0.5 text-xs font-medium bg-zinc-700 text-gray-400 rounded">WITHDRAWN</span>
														{/if}
													</a>
												</td>
												<td class="px-4 py-2">
													<span class="text-gray-300 text-sm">{entry.wins}-{entry.losses}</span>
												</td>
												<td class="px-4 py-2">
													<span class="{entry.isWithdrawn ? 'text-gray-400' : 'text-white'} text-sm font-medium"
														>{entry.points.toFixed(1)}</span
													>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/each}
				{/if}
			</main>
		</div>
	</div>
</div>
