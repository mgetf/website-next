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
			next: string;
			lastWinner: string;
			lastWinnerDate: string;
			prize: string;
		};
		championshipData: {
			winner2024: string;
			nextDate: string;
		};
	}

	let { data } = $props<{ data: PageData }>();

	// Destructure the data from the server with fallbacks
	const leagueData = data.leagueData || { season: 'Season 1', topTeams: [] };
	const tournamentData = data.tournamentData || { next: 'TBD', lastWinner: 'TBD', lastWinnerDate: 'TBD', prize: '$250' };
	const championshipData = data.championshipData || { winner2024: 'TBD', nextDate: 'TBD 2025' };
</script>

<div class="min-h-screen">
	<!-- Hero Section -->
	<section class="relative py-20 px-6 text-center">
		<div class="max-w-4xl mx-auto">
			<h1 class="text-7xl font-black mb-6 bg-gradient-to-r from-orange-500 via-red-500 to-red-600 bg-clip-text text-transparent drop-shadow-2xl">
				MGE.tf
			</h1>
			<p class="text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
				Join the premier Team Fortress 2 MGE competitive platform. Test your skills in 2v2 leagues, 
				1v1 tournaments, and compete for championship glory.
			</p>
		</div>
	</section>

	<!-- Competition Cards -->
	<section class="max-w-7xl mx-auto px-6 mb-16">
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8">
			
			<!-- 2v2 League Card -->
			<div class="bg-zinc-900 rounded-xl p-8 border-2 border-blue-500 hover:border-blue-400 transition-all shadow-xl shadow-blue-500/10 hover:shadow-blue-500/20 flex flex-col">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-2xl font-bold text-blue-400">2v2 LEAGUE</h3>
					<span class="px-3 py-1 bg-blue-500 bg-opacity-20 rounded-full text-sm text-blue-300">
						Active
					</span>
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

			<!-- 1v1 Tournaments Card -->
			<div class="bg-zinc-900 rounded-xl p-8 border-2 border-purple-500 hover:border-purple-400 transition-all shadow-xl shadow-purple-500/10 hover:shadow-purple-500/20 flex flex-col">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-2xl font-bold text-purple-400">1v1 TOURNAMENTS</h3>
					<span class="px-3 py-1 bg-purple-500/20 rounded-full text-sm font-medium text-purple-300 border border-purple-500/30">
						Upcoming
					</span>
				</div>
				
				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">Next Tournament</p>
					<p class="text-xl font-semibold text-white">{tournamentData.next}</p>
				</div>

				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">Prize Pool</p>
					<p class="text-3xl font-bold text-yellow-400">{tournamentData.prize}</p>
				</div>

				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">Last Winner</p>
					<div class="flex items-center gap-3 bg-zinc-800 rounded-lg p-3 border border-zinc-700">
						<div class="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
							<span class="text-xl">🏆</span>
						</div>
						<div>
							<p class="text-white font-semibold">{tournamentData.lastWinner}</p>
							<p class="text-xs text-gray-400">{tournamentData.lastWinnerDate}</p>
						</div>
					</div>
				</div>

				<a 
					href="/tournaments" 
					class="block w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg text-center transition-all shadow-lg hover:shadow-purple-500/30 mt-auto"
				>
					View Tournaments →
				</a>
			</div>

			<!-- World Championship Card -->
			<div class="bg-zinc-900 rounded-xl p-8 border-2 border-red-500 hover:border-red-400 transition-all shadow-xl shadow-red-500/10 hover:shadow-red-500/20 flex flex-col">
				<div class="flex items-center justify-between mb-4">
					<h3 class="text-2xl font-bold text-red-400">WORLD CHAMPIONSHIP</h3>
					<span class="px-3 py-1 bg-red-500/20 rounded-full text-sm font-medium text-red-300 border border-red-500/30">
						Annual
					</span>
				</div>
				
				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">2024 Champion</p>
					<div class="bg-gradient-to-r from-yellow-500 to-red-500 rounded-xl p-4 text-center shadow-lg">
						<div class="text-4xl mb-2">👑</div>
						<p class="text-xl font-bold text-white drop-shadow-lg">{championshipData.winner2024}</p>
					</div>
				</div>

				<div class="mb-6">
					<p class="text-gray-400 text-sm mb-2">Next Championship</p>
					<p class="text-xl font-semibold text-white">{championshipData.nextDate}</p>
				</div>

				<div class="mb-6 bg-zinc-800 rounded-lg p-4 border border-zinc-700">
					<p class="text-sm text-gray-300 text-center leading-relaxed">
						The ultimate test of skill. Top players from all regions compete for the title of World Champion.
					</p>
				</div>

				<a 
					href="/championships" 
					class="block w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-center transition-all shadow-lg hover:shadow-red-500/30 mt-auto"
				>
					View Championships →
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
