<script lang="ts">
	import type { PageData } from './$types';
	
	// Svelte 5 runes - get data from server
	let { data }: { data: PageData } = $props();
	
	// Destructure for easier access
	const { team, currentRoster, pastRoster, matchesBySeason } = data;
	
	// Format date helper
	function formatDate(date: Date | string | null): string {
		if (!date) return 'N/A';
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
	}
	
	// Get result color
	function getResultColor(result: string): string {
		if (result === 'W') return 'text-green-400';
		if (result === 'L') return 'text-red-400';
		if (result === 'D') return 'text-yellow-400';
		return 'text-gray-400';
	}
	
	// Get team status badge color
	function getStatusColor(status: string): string {
		const statusStr = status.toString();
		if (statusStr === 'READY') return 'bg-green-500/20 text-green-400 border-green-500/30';
		if (statusStr === 'PENDING') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
		if (statusStr === 'UNREADY') return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
		return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
	}
	
	// Calculate win rate
	const totalGames = team.wins + team.losses;
	const winRate = totalGames > 0 ? ((team.wins / totalGames) * 100).toFixed(1) : '0.0';
</script>

<div class="min-h-screen pb-16">
	<!-- Team Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
			<div class="flex flex-col md:flex-row items-center gap-8">
				<!-- Team Logo -->
				<div class="flex-shrink-0">
					{#if team.avatar}
						<img 
							src={team.avatar} 
							alt={team.name} 
							class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl object-cover"
						/>
					{:else}
						<div class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl bg-zinc-800 flex items-center justify-center">
							<span class="text-4xl font-black text-zinc-600">
								{team.name.charAt(0)}
							</span>
						</div>
					{/if}
				</div>
				
				<!-- Team Info -->
				<div class="flex-grow text-center md:text-left">
					<h1 class="text-5xl font-black text-white mb-2">
						{team.name}
					</h1>
					{#if team.acronym}
						<p class="text-2xl text-gray-400 mb-4">{team.acronym}</p>
					{/if}
					
					<div class="flex flex-wrap gap-3 justify-center md:justify-start mb-4">
						{#if team.division && team.region}
							<span class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium border border-blue-500/30">
								{team.division} ({team.region})
							</span>
						{/if}
						{#if team.seasonNum}
							<span class="px-4 py-1.5 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium border border-purple-500/30">
								Season {team.seasonNum}
							</span>
						{/if}
						<span class="px-4 py-1.5 rounded-full text-sm font-medium border {getStatusColor(team.status)}">
							{team.status}
						</span>
					</div>
					
					<div class="flex flex-wrap gap-6 justify-center md:justify-start text-sm">
						<div>
							<span class="text-gray-400">Record:</span>
							<span class="text-white font-medium ml-2">{team.wins} - {team.losses}</span>
							<span class="text-gray-500 ml-1">({winRate}%)</span>
						</div>
						<div>
							<span class="text-gray-400">Points:</span>
							<span class="text-white font-medium ml-2">{team.pointsScored} - {team.pointsScoredAgainst}</span>
						</div>
						<div>
							<span class="text-gray-400">Created:</span>
							<span class="text-white font-medium ml-2">{formatDate(team.createdAt)}</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
	
	<!-- Main Content - Two Column Layout -->
	<div class="max-w-7xl mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			
			<!-- Left Column - Roster -->
			<div class="space-y-6">
				<!-- Current Roster -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-xl font-bold text-white">
							Current Roster <span class="text-gray-500">({currentRoster.length} / 3)</span>
						</h2>
					</div>
					
					<div class="p-6">
						<div class="space-y-4">
							{#each currentRoster as player}
								<a 
									href="/player/{player.steamId}"
									class="flex items-center justify-between p-4 bg-zinc-950/50 rounded-lg hover:bg-zinc-800/50 transition-colors group"
								>
									<div class="flex items-center gap-4">
										<img 
											src={player.avatar} 
											alt={player.name}
											class="w-12 h-12 rounded"
										/>
										<div>
											<div class="flex items-center gap-2">
												<span class="text-white font-medium group-hover:text-blue-400 transition-colors">
													{player.name}
												</span>
												{#if player.isLeader}
													<span class="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded border border-yellow-500/30">
														Leader
													</span>
												{/if}
											</div>
											<div class="text-sm text-gray-400">
												Joined: {formatDate(player.joinedAt)}
											</div>
										</div>
									</div>
									
									{#if !player.isPaid}
										<span class="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded border border-red-500/30">
											Payment Required
										</span>
									{/if}
								</a>
							{/each}
						</div>
					</div>
				</div>
				
				<!-- Past Roster -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-xl font-bold text-white">Past Roster</h2>
					</div>
					
					<div class="p-6">
						{#if pastRoster.length > 0}
							<div class="space-y-4">
								{#each pastRoster as player}
									<a 
										href="/player/{player.steamId}"
										class="flex items-center justify-between p-4 bg-zinc-950/50 rounded-lg hover:bg-zinc-800/50 transition-colors group"
									>
										<div class="flex items-center gap-4">
											<img 
												src={player.avatar} 
												alt={player.name}
												class="w-12 h-12 rounded opacity-60"
											/>
											<div>
												<span class="text-white font-medium group-hover:text-blue-400 transition-colors">
													{player.name}
												</span>
												<div class="text-sm text-gray-400">
													{formatDate(player.joinedAt)} - {formatDate(player.leftAt)}
												</div>
											</div>
										</div>
									</a>
								{/each}
							</div>
						{:else}
							<p class="text-center text-gray-500 py-4">No past players in this team</p>
						{/if}
					</div>
				</div>
			</div>
			
			<!-- Right Column - Matches -->
			<div class="space-y-6">
				{#each matchesBySeason as seasonData}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-xl font-bold text-white">{seasonData.season}</h2>
						</div>
						
						<div class="p-6">
							<div class="space-y-2">
								{#each seasonData.matches as match}
									<div class="flex items-center justify-between p-3 bg-zinc-950/50 rounded hover:bg-zinc-800/30 transition-colors">
										<div class="flex items-center gap-4 flex-1">
											<div class="text-sm font-medium text-gray-400 w-20">
												{match.week}
											</div>
											<div class="flex-1">
												{#if match.opponent && match.opponentId}
													<a href="/teams/{match.opponentId}" class="text-white hover:text-blue-400 transition-colors">
														{match.opponent}
													</a>
												{:else if match.opponent}
													<span class="text-white">{match.opponent}</span>
												{:else}
													<span class="text-gray-500 italic">{match.score}</span>
												{/if}
											</div>
										</div>
										<div class="flex items-center gap-4">
											{#if match.opponent && match.result !== 'TBD'}
												<span class="text-sm {getResultColor(match.result)} font-bold w-20 text-right">
													{match.result} {match.score}
												</span>
											{:else if match.result === 'TBD'}
												<span class="text-sm text-gray-500 w-20 text-right">
													{formatDate(match.date)}
												</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>
			
		</div>
	</div>
</div>

