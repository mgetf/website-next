<script lang="ts">
	import { page } from '$app/stores';
	
	// Get team ID from URL params
	const teamId = $page.params.id;
	
	// Mock team data - will be replaced with real data later
	const team = {
		id: 5,
		name: 'WARHAMMER',
		tag: 'wrhm',
		logoUrl: `https://picsum.photos/seed/WARHAMMER/200`,
		division: 'PREMIER',
		region: 'EU',
		wins: 2,
		losses: 0,
		status: 'Ready',
		createdAt: new Date('2025-04-26')
	};
	
	// Current roster
	const currentRoster = [
		{
			steamId: '76561198000000001',
			name: 'ry4n',
			avatar: 'https://picsum.photos/seed/ry4n/64',
			joinedAt: new Date('2025-04-26'),
			isPaid: true,
			isLeader: true
		},
		{
			steamId: '76561198000000002',
			name: 'Fancy',
			avatar: 'https://picsum.photos/seed/Fancy/64',
			joinedAt: new Date('2025-04-26'),
			isPaid: true,
			isLeader: false
		},
		{
			steamId: '76561198000000003',
			name: 'lardox',
			avatar: 'https://picsum.photos/seed/lardox/64',
			joinedAt: new Date('2025-09-02'),
			isPaid: false,
			isLeader: false
		}
	];
	
	const pastRoster = [
		{
			steamId: '76561198000000004',
			name: 'exPlayer1',
			avatar: 'https://picsum.photos/seed/exPlayer1/64',
			joinedAt: new Date('2025-03-15'),
			leftAt: new Date('2025-04-20')
		}
	];
	
	// Matches organized by season
	const matchesBySeason = [
		{
			season: 'Season 2',
			matches: [
				{
					week: 'Week 1e',
					opponent: 'Papa Tense',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-05-10')
				},
				{
					week: 'Week 11',
					opponent: 'Avalon',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-05-17')
				}
			]
		},
		{
			season: 'Season 1',
			matches: [
				{
					week: 'Week 1l',
					opponent: null,
					result: 'BYE',
					score: 'BYE WEEK',
					date: null
				},
				{
					week: 'Week 2l',
					opponent: 'Papa Tense',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-03-20')
				},
				{
					week: 'Week 3b',
					opponent: 'abc123',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-03-27')
				},
				{
					week: 'Week 4l',
					opponent: 'PRO PIRO',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-04-03')
				},
				{
					week: 'Week 5l',
					opponent: 'MGE DOGS',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-04-10')
				},
				{
					week: 'Week 6a',
					opponent: '/for fence',
					result: 'W',
					score: '3 - 2',
					date: new Date('2025-04-17')
				},
				{
					week: 'Week 7a',
					opponent: 'PRO PIRO',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-04-24')
				},
				{
					week: 'Week 8l',
					opponent: 'MGE DOGS',
					result: 'W',
					score: '3 - 0',
					date: new Date('2025-05-01')
				},
				{
					week: 'Round 1',
					opponent: null,
					result: 'BYE',
					score: 'BYE WEEK',
					date: null
				},
				{
					week: 'Round 2',
					opponent: '/for fence',
					result: 'W',
					score: '4 - 1',
					date: new Date('2025-05-15')
				},
				{
					week: 'Round 3',
					opponent: 'Papa Tense',
					result: 'W',
					score: '4 - 0',
					date: new Date('2025-05-22')
				}
			]
		}
	];
	
	// Format date helper
	function formatDate(date: Date | null): string {
		if (!date) return 'N/A';
		return date.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
	}
	
	// Get result color
	function getResultColor(result: string): string {
		if (result === 'W') return 'text-green-400';
		if (result === 'L') return 'text-red-400';
		return 'text-gray-400';
	}
</script>

<div class="min-h-screen pb-16">
	<!-- Team Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
			<div class="flex flex-col md:flex-row items-center gap-8">
				<!-- Team Logo -->
				<div class="flex-shrink-0">
					<img 
						src={team.logoUrl} 
						alt={team.name} 
						class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl"
					/>
				</div>
				
				<!-- Team Info -->
				<div class="flex-grow text-center md:text-left">
					<h1 class="text-5xl font-black text-white mb-2">
						{team.name}
					</h1>
					<p class="text-2xl text-gray-400 mb-4">{team.tag}</p>
					
					<div class="flex flex-wrap gap-3 justify-center md:justify-start mb-4">
						<span class="px-4 py-1.5 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium border border-blue-500/30">
							{team.division} ({team.region})
						</span>
						<span class="px-4 py-1.5 bg-zinc-800 text-white rounded-full text-sm font-medium">
							{team.region}
						</span>
						<span class="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-full text-sm font-medium border border-green-500/30">
							{team.status}
						</span>
					</div>
					
					<div class="flex flex-wrap gap-6 justify-center md:justify-start text-sm">
						<div>
							<span class="text-gray-400">Record:</span>
							<span class="text-white font-medium ml-2">{team.wins} - {team.losses}</span>
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
												{#if match.opponent}
													<span class="text-white">{match.opponent}</span>
												{:else}
													<span class="text-gray-500 italic">{match.score}</span>
												{/if}
											</div>
										</div>
										<div class="flex items-center gap-4">
											{#if match.opponent}
												<span class="text-sm {getResultColor(match.result)} font-bold w-16 text-right">
													{match.result} ({match.score})
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

