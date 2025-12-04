<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	
	// Svelte 5 runes - get data from server
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	// Destructure for easier access - use $derived to react to data changes
	const team = $derived(data.team);
	const currentRoster = $derived(data.currentRoster);
	const pastRoster = $derived(data.pastRoster);
	const matchesBySeason = $derived(data.matchesBySeason);
	
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
	
	// Calculate win rate - reactive
	const totalGames = $derived(team.wins + team.losses);
	const winRate = $derived(totalGames > 0 ? ((team.wins / totalGames) * 100).toFixed(1) : '0.0');
</script>

<div class="min-h-screen pb-16">
	<!-- Success/Error Messages -->
	{#if form?.success}
		<div class="fixed top-4 right-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg shadow-lg z-50">
			<p class="text-green-400">{form.message}</p>
		</div>
	{/if}
	
	{#if form?.error}
		<div class="fixed top-4 right-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg shadow-lg z-50">
			<p class="text-red-400">{form.error}</p>
		</div>
	{/if}

	<!-- Team Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
			<!-- Admin Badge -->
			{#if data.isGlobalAdmin}
				<div class="mb-4 p-3 bg-purple-500/20 border border-purple-500/50 rounded-lg">
					<p class="text-purple-400 text-sm">
						👑 <strong>Admin Mode:</strong> You have full management access to this team
					</p>
				</div>
			{/if}
			
			<!-- Roster Lock Warning -->
			{#if data.rosterLocked && data.canManageTeam}
				<div class="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
					<p class="text-yellow-400 text-sm">
						🔒 <strong>Rosters are locked.</strong>
						{#if data.isGlobalAdmin}
							You can bypass this restriction as an admin.
						{:else}
							Roster changes are currently disabled.
						{/if}
					</p>
				</div>
			{/if}
			
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
								<div class="flex items-center justify-between p-4 bg-zinc-950/50 rounded-lg transition-colors group">
								<a 
									href="/users/{player.steamId}"
									class="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
								>
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
									</a>
									
									<div class="flex items-center gap-2">
										{#if !player.isPaid}
											{#if player.steamId === data.currentUserSteamId}
												<a 
													href="/checkout/{player.steamId}"
													class="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded border border-red-500/30 hover:bg-red-500/30 hover:text-red-300 transition-colors"
												>
													Payment Required
												</a>
											{:else}
												<span class="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded border border-red-500/30">
													Payment Required
												</span>
											{/if}
										{/if}
										
										<!-- Remove Player Button (for admins/team admins, not for owner) -->
										{#if data.canManageTeam && player.permissionLevel !== 2 && player.steamId !== data.currentUserSteamId && (!data.rosterLocked || data.isGlobalAdmin)}
											<form method="POST" action="?/removePlayer" use:enhance>
												<input type="hidden" name="playerSteamId" value={player.steamId} />
												<button
													type="submit"
													onclick={(e) => {
														if (!confirm(`Remove ${player.name} from the team?`)) {
															e.preventDefault();
														}
													}}
													class="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition-colors"
													title="Remove player from team"
												>
													Remove
												</button>
											</form>
										{/if}
									</div>
								</div>
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
									href="/users/{player.steamId}"
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
				{#if matchesBySeason.length > 0}
					{#each matchesBySeason as seasonData}
						<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
							<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
								<h2 class="text-xl font-bold text-white">{seasonData.season}</h2>
							</div>
							
							<div class="p-6">
								<div class="space-y-2">
									{#each seasonData.matches as match}
										<a 
											href="/matches/{match.matchId}"
											class="flex items-center justify-between p-3 bg-zinc-950/50 rounded hover:bg-zinc-800/30 transition-colors group"
										>
											<div class="flex items-center gap-4 flex-1">
												<div class="text-sm font-medium text-gray-400 w-20">
													{match.week}
												</div>
												<div class="flex-1">
													{#if match.opponent && match.opponentId}
														<span class="text-white group-hover:text-blue-400 transition-colors">
															vs {match.opponent}
														</span>
													{:else if match.opponent}
														<span class="text-white group-hover:text-blue-400 transition-colors">
															vs {match.opponent}
														</span>
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
										</a>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				{:else}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-xl font-bold text-white">Match History</h2>
						</div>
						
						<div class="p-6">
							<div class="text-center py-8">
								<div class="text-6xl mb-4 opacity-50">🏆</div>
								<p class="text-gray-500 text-lg">No match history yet</p>
								<p class="text-gray-600 text-sm mt-2">This team hasn't participated in any seasons</p>
							</div>
						</div>
					</div>
				{/if}
			</div>
			
		</div>
		
		<!-- Admin Controls -->
		{#if data.canManageTeam}
			<div class="mt-8 bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
				<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
					<h2 class="text-xl font-bold text-white">Team Management</h2>
				</div>
				
				<div class="p-6 space-y-6">
					<!-- Edit Team Link -->
					<a 
						href="/teams/{team.id}/edit"
						class="inline-block px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
					>
						✏️ Edit Team Settings
					</a>
					
					<!-- Admin: Change Status -->
					{#if data.isGlobalAdmin}
						<div class="pt-4 border-t border-zinc-800">
							<h3 class="text-lg font-bold text-white mb-4">Change Team Status</h3>
							<form method="POST" action="?/updateStatus" use:enhance class="flex gap-3 items-end">
								<div class="flex-1">
									<label for="status" class="block text-sm font-medium text-gray-300 mb-2">
										Team Status
									</label>
									<select
										id="status"
										name="status"
										value={team.status}
										class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
									>
										<option value="UNREADY">Unready</option>
										<option value="PENDING">Pending</option>
										<option value="READY">Ready</option>
										<option value="DEAD">Dead</option>
										<option value="PLACEMENT">Placement</option>
									</select>
								</div>
								<button
									type="submit"
									class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
								>
									Update Status
								</button>
							</form>
						</div>
						
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

