<script lang="ts">
import { goto } from '$app/navigation';
import DataTable from '$lib/components/ui/DataTable.svelte';

const standingsColumns = [
	{ key: 'player', label: 'Player' },
	{ key: 'record', label: 'Record' },
	{ key: 'points', label: 'Avg Points' }
];

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
  staffByDivision: Array<{
    division: { id: number; name: string };
    staff: Array<{
      steamId: string;
      name: string;
      avatar: string | null;
      role: string;
    }>;
  }>;
  deadlines: {
    signupClosed: boolean;
    rosterLocked: boolean;
    paymentRequired: boolean;
  };
  userAlreadySignedUp: boolean;
}

let { data } = $props<{ data: PageData }>();

let selectedSeason = $state(0);
let selectedRegion = $state(0);
let isInitialized = $state(false);

$effect(() => {
  selectedSeason = data.selectedSeasonId;
  selectedRegion = data.selectedRegionId;
});

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

	<!-- Main Content with Sidebars -->
	<div class="max-w-[1600px] mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
			
			<!-- Left Sidebar - Deadlines -->
			<aside class="lg:col-span-3 space-y-4">
				<!-- Player Registration Deadline -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-3">Player Registration</h3>
					<div class="text-4xl font-black {data.deadlines.signupClosed ? 'text-red-500' : 'text-green-500'} mb-4">
						{data.deadlines.signupClosed ? 'CLOSED' : 'OPEN'}
					</div>
					{#if !data.deadlines.signupClosed && !data.userAlreadySignedUp}
						<a
							href="/signup/1v1"
							class="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
						>
							Sign Up Now
						</a>
					{/if}
				</div>
				
				<!-- Payments Due -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-4">Payment Status</h3>
					<div class="text-3xl font-black {data.deadlines.paymentRequired ? 'text-yellow-500' : 'text-gray-500'} mb-2">
						{data.deadlines.paymentRequired ? 'REQUIRED' : 'NOT REQUIRED'}
					</div>
					{#if data.deadlines.paymentRequired}
						<p class="text-xs text-gray-400">Players must pay registration fees</p>
					{/if}
				</div>

				<!-- Roster Lock Status -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-3">Registration Status</h3>
					<div class="text-3xl font-black {data.deadlines.rosterLocked ? 'text-red-500' : 'text-green-500'} mb-2">
						{data.deadlines.rosterLocked ? 'LOCKED' : 'OPEN'}
					</div>
					<p class="text-xs text-gray-400">
						{data.deadlines.rosterLocked ? 'Registrations are frozen' : 'Players can still register'}
					</p>
				</div>
			</aside>

			<!-- Center - Standings -->
			<main class="lg:col-span-6 space-y-8">
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
							<DataTable
								data={divisionData.entries}
								columns={standingsColumns}
								emptyMessage="No players in this division"
							>
								{#snippet cell(entry: PageData['entriesByDivision'][0]['entries'][0], col)}
									{#if col.key === 'player'}
										<a
											href={entry.steamId
												? `/users/${entry.steamId}`
												: `/teams/${entry.teamId}`}
											class="flex items-center gap-2 text-sm font-medium hover:text-purple-400 transition-colors {entry.isWithdrawn ? 'text-gray-400' : 'text-white'}"
										>
											<img
												src={entry.avatar ||
													`https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg`}
												alt={entry.name}
												class="w-8 h-8 rounded object-cover {entry.isWithdrawn ? 'grayscale' : ''}"
											/>
											<span>{entry.name}</span>
											{#if entry.isWithdrawn}
												<span class="px-1.5 py-0.5 text-xs font-medium bg-zinc-700 text-gray-400 rounded">WITHDRAWN</span>
											{/if}
										</a>
									{:else if col.key === 'record'}
										<span class="text-gray-300 text-sm">{entry.wins}-{entry.losses}</span>
									{:else if col.key === 'points'}
										<span class="{entry.isWithdrawn ? 'text-gray-400' : 'text-white'} text-sm font-medium"
											>{entry.points.toFixed(1)}</span
										>
									{/if}
								{/snippet}
							</DataTable>
						</div>
					{/each}
				{/if}
			</main>

			<!-- Right Sidebar - Staff List -->
			<aside class="lg:col-span-3">
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 sticky top-4">
					<!-- Staff Header -->
					<div class="px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Staff List</h3>
					</div>
					
					<!-- Staff List Content -->
					<div class="max-h-[calc(100vh-200px)] overflow-y-auto">
						{#if data.staffByDivision.length === 0}
							<div class="px-4 py-8 text-center">
								<p class="text-gray-500 text-sm">No staff members found.</p>
							</div>
						{:else}
							{#each data.staffByDivision as divisionStaff}
								<div class="border-b border-zinc-800/50 last:border-0">
									<!-- Division Header -->
									<div class="px-4 py-2 bg-zinc-950/50">
										<h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider">
											{divisionStaff.division.name} ({getRegionAbbr(selectedRegion)})
										</h4>
									</div>
									
									<!-- Staff Members -->
									<div class="px-4 py-2 space-y-2">
										{#each divisionStaff.staff as member}
											<a 
												href="/users/{member.steamId}"
												class="flex items-center justify-between py-2 hover:bg-zinc-800/30 rounded px-2 -mx-2 transition-colors group"
											>
												<div class="flex items-center gap-2">
													<img 
														src={member.avatar || `https://picsum.photos/seed/${member.name}/32`}
														alt={member.name}
														class="w-7 h-7 rounded"
													/>
													<span class="text-sm text-white group-hover:text-blue-400 transition-colors">
														{member.name}
													</span>
												</div>
												<span class="text-xs text-yellow-500/80">
													{member.role}
												</span>
											</a>
										{/each}
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			</aside>
			
		</div>
	</div>
</div>
