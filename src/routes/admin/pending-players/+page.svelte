<script lang="ts">
	// Mock pending players data
	const pendingPlayers = [
		{
			id: 1,
			playerName: 'newplayer123',
			playerAvatar: 'https://picsum.photos/seed/player1/64',
			teamName: 'WARHAMMER',
			teamId: 5,
			requestedAt: '2025-10-07 14:32',
			division: 'Premier'
		},
		{
			id: 2,
			playerName: 'MGE_Rookie',
			playerAvatar: 'https://picsum.photos/seed/player2/64',
			teamName: 'Papa Tense',
			teamId: 2,
			requestedAt: '2025-10-07 10:15',
			division: 'Premier'
		},
		{
			id: 3,
			playerName: 'FragMaster',
			playerAvatar: 'https://picsum.photos/seed/player3/64',
			teamName: 'MGE DOGS',
			teamId: 3,
			requestedAt: '2025-10-06 18:45',
			division: 'Premier'
		}
	];
	
	function approvePlayer(id: number) {
		console.log('Approve player', id);
		// TODO: Wire up API call
	}
	
	function denyPlayer(id: number) {
		console.log('Deny player', id);
		// TODO: Wire up API call
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Pending Players</h2>
		<p class="text-gray-400">Approve or deny team join requests</p>
	</div>
	
	<!-- Pending Requests -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
		{#each pendingPlayers as player}
			<div class="p-6 hover:bg-zinc-800/50 transition-colors">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-4">
						<!-- Player Avatar -->
						<img
							src={player.playerAvatar}
							alt={player.playerName}
							class="w-16 h-16 rounded-lg"
						/>
						
						<!-- Request Details -->
						<div>
							<div class="flex items-center gap-3 mb-1">
								<span class="text-white font-semibold">{player.playerName}</span>
								<span class="text-gray-500">→</span>
								<a href="/teams/{player.teamId}" class="text-orange-400 hover:text-orange-300 font-medium">
									{player.teamName}
								</a>
							</div>
							<div class="flex items-center gap-3 text-sm text-gray-400">
								<span>{player.division} Division</span>
								<span>•</span>
								<span>Requested {player.requestedAt}</span>
							</div>
						</div>
					</div>
					
					<!-- Actions -->
					<div class="flex items-center gap-3">
						<button
							onclick={() => approvePlayer(player.id)}
							class="px-6 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors font-medium"
						>
							✓ Approve
						</button>
						<button
							onclick={() => denyPlayer(player.id)}
							class="px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium"
						>
							✗ Deny
						</button>
					</div>
				</div>
			</div>
		{/each}
		
		{#if pendingPlayers.length === 0}
			<div class="py-12 text-center">
				<span class="text-6xl mb-4 block">✅</span>
				<p class="text-gray-400">No pending player requests</p>
			</div>
		{/if}
	</div>
</div>

