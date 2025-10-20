<script lang="ts">
	interface PageData {
		leagueData: {
			season: string;
			topTeams: Array<{
				rank: number;
				name: string;
				record: string;
				points: number;
				id: number;
			}>;
		};
		tournamentData: {
			recentEvents: Array<{
				type: 'cup' | 'championship' | 'fightnight';
				id: number;
				name: string;
				date: Date | null;
				icon: string;
				format?: string;
				winner?: {
					steamId: string;
					steamUsername: string;
					steamAvatar: string;
				} | null;
				matchupCount?: number;
			}>;
			totalCounts: {
				cups: number;
				championships: number;
				fightNights: number;
			};
		};
	}

	let { data } = $props<{ data: PageData }>();

	// Destructure the data from the server with fallbacks
	const leagueData = data.leagueData || { season: 'Season 1', topTeams: [] };
	const tournamentData = data.tournamentData || { 
		recentEvents: [], 
		totalCounts: { cups: 0, championships: 0, fightNights: 0 } 
	};

	const formatEventDate = (date: Date | null) => {
		if (!date) return 'TBD';
		try {
			const d = new Date(date);
			if (isNaN(d.getTime())) return 'TBD';
			return d.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return 'TBD';
		}
	};
</script>

<div class="min-h-screen">
	<!-- Hero Section -->
	<section class="relative py-20 px-6 text-center">
		<div class="max-w-4xl mx-auto">
			<h1 class="text-7xl font-black mb-6 bg-gradient-to-r from-orange-500 via-red-500 to-red-600 bg-clip-text text-transparent drop-shadow-2xl">
				MGE.tf
			</h1>
			<p class="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
				Join the premier Team Fortress 2 MGE competitive platform. Test your skills in 2v2 leagues 
				and competitive tournaments with real prizes.
			</p>
		</div>
	</section>

	<!-- Competition Cards -->
	<section class="max-w-7xl mx-auto px-6 mb-16">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			
			<!-- 2v2 League Card -->
			<div class="bg-zinc-900 rounded-xl p-8 border-2 border-blue-500 hover:border-blue-400 transition-all shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 flex flex-col">
				<div class="mb-4">
					<h3 class="text-2xl font-bold text-blue-400">2v2 LEAGUE</h3>
				</div>
				
				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">Current Season</p>
					<p class="text-xl font-semibold text-white">{leagueData.season}</p>
				</div>

				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-3">Premier Division Top 3</p>
					<div class="space-y-2">
						{#if leagueData.topTeams.length > 0}
							{#each leagueData.topTeams as team}
								<a 
									href="/teams/{team.id}"
									class="flex items-center justify-between bg-gray-800 bg-opacity-50 rounded p-2 hover:bg-gray-700 transition-colors"
								>
									<div class="flex items-center gap-3">
										<span class="text-gray-400 font-mono w-6">#{team.rank}</span>
										<span class="text-white font-medium">{team.name}</span>
									</div>
									<div class="text-right">
										<div class="text-sm text-gray-400">{team.record}</div>
										<div class="text-xs text-gray-500">{team.points} ppg</div>
									</div>
								</a>
							{/each}
						{:else}
							<div class="text-center py-4 text-gray-500">
								No teams yet this season
							</div>
						{/if}
					</div>
				</div>

				<a 
					href="/leagues/2v2" 
					class="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-center transition-colors mt-auto"
				>
					View Full Standings →
				</a>
			</div>

			<!-- Tournaments Card -->
			<div class="bg-zinc-900 rounded-xl p-8 border-2 border-purple-500 hover:border-purple-400 transition-all shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 flex flex-col">
				<div class="mb-6">
					<h3 class="text-2xl font-bold text-purple-400">TOURNAMENTS</h3>
				</div>
				
				<!-- Recent Events -->
				<div class="mb-6 flex-grow">
					<p class="text-gray-400 text-sm mb-3">Recent Events</p>
					<div class="space-y-3">
						{#if tournamentData.recentEvents.length > 0}
							{#each tournamentData.recentEvents as event}
								<div class="bg-zinc-800 rounded-lg p-3 border border-zinc-700 hover:border-purple-500/50 transition-colors">
									<div class="flex items-start gap-3">
										<span class="text-2xl">{event.icon}</span>
										<div class="flex-1 min-w-0">
											<div class="flex items-center gap-2 mb-1">
												<p class="text-white font-semibold text-sm truncate">{event.name}</p>
												{#if event.format}
													<span class="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs font-medium border border-purple-500/30 flex-shrink-0">
														{event.format}
													</span>
												{/if}
											</div>
											{#if event.winner}
												<div class="flex items-center gap-2">
													<img 
														src={event.winner.steamAvatar || '/default-avatar.png'} 
														alt={event.winner.steamUsername}
														class="w-5 h-5 rounded-full"
													/>
													<p class="text-xs text-gray-400 truncate">
														Winner: <span class="text-gray-300">{event.winner.steamUsername}</span>
													</p>
												</div>
											{:else if event.matchupCount !== undefined}
												<p class="text-xs text-gray-400">
													{event.matchupCount} {event.matchupCount === 1 ? 'matchup' : 'matchups'}
												</p>
											{/if}
											<p class="text-xs text-gray-500 mt-1">{formatEventDate(event.date)}</p>
										</div>
									</div>
								</div>
							{/each}
						{:else}
							<div class="text-center py-8 text-gray-500">
								<p class="text-2xl mb-2">🏆</p>
								<p class="text-sm">No tournaments yet</p>
							</div>
						{/if}
					</div>
				</div>

				<!-- Total Counts -->
				<div class="mb-6 pt-4 border-t border-zinc-800">
					<div class="flex items-center justify-center gap-4 text-xs text-gray-400">
						<div class="text-center">
							<p class="text-white font-bold text-lg">{tournamentData.totalCounts.cups}</p>
							<p>Cups</p>
						</div>
						<div class="w-px h-8 bg-zinc-700"></div>
						<div class="text-center">
							<p class="text-white font-bold text-lg">{tournamentData.totalCounts.championships}</p>
							<p>Championships</p>
						</div>
						<div class="w-px h-8 bg-zinc-700"></div>
						<div class="text-center">
							<p class="text-white font-bold text-lg">{tournamentData.totalCounts.fightNights}</p>
							<p>Fight Nights</p>
						</div>
					</div>
				</div>

				<a 
					href="/tournaments" 
					class="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg text-center transition-all shadow-lg hover:shadow-purple-500/30"
				>
					View All Tournaments →
				</a>
			</div>

		</div>
	</section>

	<!-- What is MGE? Section -->
	<section class="max-w-6xl mx-auto px-6 pb-20">
		<div class="bg-zinc-900 rounded-xl p-12 border-2 border-zinc-800 shadow-2xl">
			<h2 class="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
				What is MGE?
			</h2>
			
			<div class="space-y-6 text-gray-300 text-lg leading-relaxed max-w-4xl mx-auto">
				<p>
					<strong class="text-white text-xl">MGE (My Gaming Edge)</strong> is a 1v1 arena-style game mode in Team Fortress 2 
					where players face off in compact maps to practice mechanics, aim, and movement.
				</p>
				
				<div class="pt-4">
					<h3 class="text-2xl font-bold text-white mb-4">History</h3>
					<p>
						Originally created as a training tool for competitive players, MGE has evolved into its own competitive 
						scene with dedicated leagues and tournaments. What started as simple aim practice has become a respected 
						esport format with seasonal competitions, prize pools, and championship events.
					</p>
				</div>
				
				<div class="pt-4">
					<h3 class="text-2xl font-bold text-white mb-4">Tips for Improvement</h3>
					<ul class="space-y-3 ml-6">
						<li class="flex items-start gap-3">
							<span class="text-orange-500 mt-1">▸</span>
							<span>Focus on consistent aim rather than flashy plays</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-orange-500 mt-1">▸</span>
							<span>Learn spawn timings and positioning for each arena</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-orange-500 mt-1">▸</span>
							<span>Practice movement techniques like rocket/sticky jumping</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-orange-500 mt-1">▸</span>
							<span>Watch demos of top players to learn new strategies</span>
						</li>
						<li class="flex items-start gap-3">
							<span class="text-orange-500 mt-1">▸</span>
							<span>Stay calm and analyze your mistakes after each round</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</section>
</div>
