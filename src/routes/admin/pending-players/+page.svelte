<script lang="ts">
import { enhance } from '$app/forms';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let isSubmitting = $state(false);
let decliningPlayerId = $state<string | null>(null);
let declineReasons = $state<Record<string, string>>({});

// Filters
let selectedDivision = $state<string>('all');
let selectedRegion = $state<string>('all');

// Filtered pending players
const filteredPlayers = $derived(() => {
  return data.pendingPlayers.filter((request) => {
    if (
      selectedDivision !== 'all' &&
      request.team.divisionId?.toString() !== selectedDivision
    ) {
      return false;
    }
    if (
      selectedRegion !== 'all' &&
      request.team.regionId?.toString() !== selectedRegion
    ) {
      return false;
    }
    return true;
  });
});

// Convert Steam64 to Steam2 ID format (STEAM_0:X:Y)
function steamIdToSteam2(steamId64: string): string {
  const id = BigInt(steamId64);
  const accountId = id - BigInt('76561197960265728');
  const y = accountId / BigInt(2);
  const x = accountId % BigInt(2);
  return `STEAM_0:${x}:${y}`;
}

// External profile URLs
function getRglUrl(steamId: string): string {
  return `https://rgl.gg/Public/PlayerProfile.aspx?p=${steamId}`;
}

function getEtf2lUrl(steamId: string): string {
  return `https://etf2l.org/search/${steamId}/`;
}

function getUgcUrl(steamId: string): string {
  const steam2Id = steamIdToSteam2(steamId);
  return `https://stats.ugc-gaming.net/mge-stats/?search=${encodeURIComponent(steam2Id)}`;
}

function getLogsTfUrl(steamId: string): string {
  return `https://logs.tf/profile/${steamId}`;
}

function getSteamUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}
</script>

<style>
	.social-link .tooltip {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		padding: 4px 8px;
		background: #18181b;
		border: 1px solid #3f3f46;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #e4e4e7;
		white-space: nowrap;
		opacity: 0;
		visibility: hidden;
		transition: opacity 0.1s, visibility 0.1s;
		pointer-events: none;
		margin-bottom: 4px;
		z-index: 50;
	}
	.social-link:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
</style>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Pending Players</h2>
		<p class="text-gray-400">Approve or deny team join requests</p>
	</div>

	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
		<div class="flex flex-wrap items-center gap-4">
			<div class="flex items-center gap-2">
				<label for="divisionFilter" class="text-sm font-medium text-gray-300">Division:</label>
				<select
					id="divisionFilter"
					bind:value={selectedDivision}
					class="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<option value="all">All Divisions</option>
					{#each data.divisions as division}
						<option value={division.id.toString()}>{division.name}</option>
					{/each}
				</select>
			</div>

			<div class="flex items-center gap-2">
				<label for="regionFilter" class="text-sm font-medium text-gray-300">Region:</label>
				<select
					id="regionFilter"
					bind:value={selectedRegion}
					class="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<option value="all">All Regions</option>
					{#each data.regions as region}
						<option value={region.id.toString()}>{region.name}</option>
					{/each}
				</select>
			</div>

			{#if selectedDivision !== 'all' || selectedRegion !== 'all'}
				<button
					onclick={() => {
						selectedDivision = 'all';
						selectedRegion = 'all';
					}}
					class="text-sm text-gray-400 hover:text-white transition"
				>
					Clear filters
				</button>
			{/if}

			<div class="ml-auto text-sm text-gray-500">
				Showing {filteredPlayers().length} of {data.pendingPlayers.length} requests
			</div>
		</div>
	</div>

	<!-- Pending Requests -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
		{#if filteredPlayers().length === 0}
			<div class="py-12 text-center">
				<span class="text-6xl mb-4 block">✅</span>
				<p class="text-gray-400">
					{#if data.pendingPlayers.length === 0}
						No pending player requests
					{:else}
						No requests match your filters
					{/if}
				</p>
			</div>
		{:else}
			{#each filteredPlayers() as request}
				<div class="p-4 hover:bg-zinc-800/50 transition-colors">
					<div class="flex flex-col lg:flex-row lg:items-center gap-4">
						<!-- Player Info -->
						<div class="flex items-center gap-3 flex-1 min-w-0">
							<!-- Player Avatar -->
							<a href="/users/{request.player.steamId}" class="flex-shrink-0">
								<img
									src={request.player.steamAvatar || '/default-avatar.png'}
									alt={request.player.steamUsername}
									class="w-12 h-12 rounded-lg hover:opacity-80 transition-opacity"
								/>
							</a>

							<!-- Request Details -->
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2 flex-wrap mb-1">
									<a
										href="/users/{request.player.steamId}"
										class="text-white font-semibold hover:text-blue-400 transition-colors"
									>
										{request.player.steamUsername}
									</a>
									<span class="text-gray-500">→</span>
									<a
										href="/teams/{request.team.id}"
										class="text-orange-400 hover:text-orange-300 font-medium transition-colors"
									>
										{request.team.name}
									</a>
								</div>
								<div class="flex items-center gap-2 text-sm text-gray-400">
									<span
										class="px-2 py-0.5 bg-zinc-800 rounded text-xs font-medium text-gray-300"
									>
										{request.team.division?.name || 'No Division'}
									</span>
									<span
										class="px-2 py-0.5 bg-zinc-800 rounded text-xs font-medium text-gray-300"
									>
										{request.team.region?.name || 'No Region'}
									</span>
								</div>
							</div>
						</div>

						<!-- External Profile Links -->
						<div class="flex items-center gap-1 flex-shrink-0">
							<a
								href={getSteamUrl(request.player.steamId)}
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/steam_logo.png" alt="Steam" class="w-5 h-5" />
								<span class="tooltip">Steam</span>
							</a>
							<a
								href={getRglUrl(request.player.steamId)}
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/rgl_logo.png" alt="RGL" class="w-5 h-5" />
								<span class="tooltip">RGL</span>
							</a>
							<a
								href={getEtf2lUrl(request.player.steamId)}
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/etf2l_logo.png" alt="ETF2L" class="w-5 h-5" />
								<span class="tooltip">ETF2L</span>
							</a>
							<a
								href={getLogsTfUrl(request.player.steamId)}
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/logstf_logo.png" alt="logs.tf" class="w-5 h-5" />
								<span class="tooltip">logs.tf</span>
							</a>
							<a
								href={getUgcUrl(request.player.steamId)}
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/ugcgaming_logo.png" alt="UGC" class="w-5 h-5" />
								<span class="tooltip">UGC-Gaming</span>
							</a>
							<a
								href="https://steamhistory.net/id/{request.player.steamId}"
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/steamhistory_logo.jpg" alt="SteamHistory" class="w-5 h-5 rounded" />
								<span class="tooltip">SteamHistory</span>
							</a>
							<a
								href="https://steamladder.com/profile/{request.player.steamId}/"
								target="_blank"
								rel="noopener noreferrer"
								class="social-link p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition relative group"
							>
								<img src="/steamladder_logo.png" alt="SteamLadder" class="w-5 h-5" />
								<span class="tooltip">SteamLadder</span>
							</a>
						</div>

						<!-- Actions -->
						<div class="flex items-center gap-2 flex-shrink-0">
							{#if decliningPlayerId === request.player.steamId}
								<!-- Decline Form -->
								<form
									method="POST"
									action="?/decline"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
											decliningPlayerId = null;
											declineReasons[request.player.steamId] = '';
										};
									}}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="playerSteamId" value={request.player.steamId} />
									<input type="hidden" name="teamId" value={request.team.id} />
									<input
										type="text"
										name="reason"
										bind:value={declineReasons[request.player.steamId]}
										placeholder="Reason..."
										required
										class="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 w-32"
									/>
									<button
										type="submit"
										disabled={isSubmitting}
										class="px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
									>
										Confirm
									</button>
									<button
										type="button"
										onclick={() => (decliningPlayerId = null)}
										class="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors text-sm"
									>
										Cancel
									</button>
								</form>
							{:else}
								<!-- Approve Button -->
								<form
									method="POST"
									action="?/approve"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
										};
									}}
								>
									<input type="hidden" name="playerSteamId" value={request.player.steamId} />
									<input type="hidden" name="teamId" value={request.team.id} />
									<button
										type="submit"
										disabled={isSubmitting}
										class="px-5 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
									>
										✓ Approve
									</button>
								</form>

								<!-- Decline Button -->
								<button
									onclick={() => (decliningPlayerId = request.player.steamId)}
									class="px-5 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium text-sm"
								>
									✗ Decline
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
