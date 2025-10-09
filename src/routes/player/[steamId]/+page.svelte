<script lang="ts">
	// Get data from server load function (Svelte 5 syntax)
	interface PlayerData {
		player: {
			steamId: string;
			name: string;
			avatar: string | null;
			discordLinked: boolean;
			discordUsername: string | null;
			permissionLevel: string;
			memberSince: Date;
		};
		isOwnProfile: boolean;
		currentTeams: Array<{
			teamId: number;
			teamName: string;
			division: string;
			regionName: string;
			seasonNum: number;
			totalRecord: string;
			joined: Date;
		}>;
		teamHistory: Array<{
			teamId: number;
			teamName: string;
			division: string;
			regionName: string;
			seasonNum: number;
			totalRecord: string;
			joined: Date;
			left: Date | null;
		}>;
		tournaments: Array<{
			id: number;
			name: string;
			date: string | null;
			placement: string;
		}>;
		fightNights: Array<{
			id: number;
			fightNightName: string;
			opponent: string;
			result: string;
			score: string;
			date: string | null;
		}>;
		achievements: Array<{
			placement: string;
			event: string;
			date: string | null;
		}>;
	}
	
	let { data }: { data: PlayerData } = $props();
	
	// Destructure data
	const { player, currentTeams, teamHistory, tournaments, fightNights, achievements, isOwnProfile } = data;
	
	// External profile links
	const externalLinks = [
		{ name: 'Steam Profile', url: `https://steamcommunity.com/profiles/${player.steamId}`, icon: '🎮' },
		{ name: 'logs.tf', url: `https://logs.tf/profile/${player.steamId}`, icon: '📊' },
		{ name: 'RGL.gg', url: `https://rgl.gg/Public/PlayerProfile.aspx?p=${player.steamId}`, icon: '🏆' },
		{ name: 'ETF2L', url: `https://etf2l.org/search/${player.steamId}/`, icon: '🇪🇺' },
		{ name: 'UGC Gaming', url: `https://www.ugcleague.com/players_page.cfm?player_id=${player.steamId}`, icon: '🎯' },
		{ name: 'SteamHistory', url: `https://steamhistory.net/id/${player.steamId}`, icon: '📜' }
	];
	
	// Format date helper
	function formatDate(date: Date | string | null): string {
		if (!date) return 'N/A';
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
	}
	
	// Get placement color
	function getPlacementColor(placement: string): string {
		if (placement.includes('1st')) return 'text-yellow-400';
		if (placement.includes('2nd')) return 'text-gray-300';
		if (placement.includes('3rd')) return 'text-orange-400';
		return 'text-gray-400';
	}
	
	// Get result color
	function getResultColor(result: string): string {
		if (result === 'W') return 'text-green-400';
		if (result === 'L') return 'text-red-400';
		return 'text-gray-400';
	}
</script>

<div class="min-h-screen pb-16">
	<!-- Player Hero Section -->
	<section class="relative py-12 px-6 bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-6xl mx-auto">
			<div class="flex flex-col items-center gap-4">
				<!-- Player Avatar -->
				<div class="flex-shrink-0">
					<img 
						src={player.avatar} 
						alt={player.name} 
						class="w-32 h-32 rounded-lg border-4 border-zinc-700 shadow-2xl"
					/>
				</div>
				
				<!-- Player Name -->
				<h1 class="text-5xl font-black text-white">
					{player.name}
				</h1>
				
				<!-- External Links -->
				<div class="flex flex-wrap gap-2 justify-center">
					{#each externalLinks as link}
						<a 
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							class="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-2 group"
							title={link.name}
						>
							<span class="text-lg">{link.icon}</span>
							<span class="text-xs text-gray-400 group-hover:text-white hidden sm:inline">
								{link.name}
							</span>
						</a>
					{/each}
				</div>
				
				<!-- Discord Status -->
				{#if player.discordLinked}
					<div class="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/20 rounded-lg text-blue-400 text-sm">
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>{player.discordUsername || 'Discord linked'}</span>
					</div>
				{:else if isOwnProfile}
					<a 
						href="/auth/discord/login"
						class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium transition-colors cursor-pointer"
					>
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>Link Discord Account</span>
					</a>
				{:else}
					<div class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800/50 rounded-lg text-gray-400 text-sm">
						<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
							<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
						</svg>
						<span>Discord not linked</span>
					</div>
				{/if}
				
				<!-- Member Since -->
				<p class="text-gray-400 text-sm">
					Member since {formatDate(player.memberSince)}
				</p>
			</div>
		</div>
	</section>
	
	<!-- Main Content - Sidebar Layout -->
	<div class="max-w-[1600px] mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
			
			<!-- Left Sidebar - Achievements -->
			<aside class="lg:col-span-3 space-y-6">
				<!-- Achievements Card -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-4 py-3 border-b border-zinc-800">
						<h3 class="text-lg font-bold text-white">Achievements</h3>
					</div>
					
					{#if achievements.length > 0}
						<div class="divide-y divide-zinc-800/50">
							{#each achievements as achievement}
								<div class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30 transition-colors">
									<!-- Trophy Icon -->
									<div class="flex-shrink-0">
										<svg class="w-5 h-5 {achievement.placement === '1st' ? 'text-yellow-400' : 
											 achievement.placement === '2nd' ? 'text-gray-300' : 
											 achievement.placement === '3rd' ? 'text-orange-400' : 
											 'text-gray-500'}" 
											 fill="currentColor" viewBox="0 0 24 24">
											<path d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a2.25 2.25 0 0 0-2.25 2.25c0 .414.336.75.75.75h15a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-2.25-2.25h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.706 6.706 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z"/>
										</svg>
									</div>
									
									<!-- Event Info -->
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-xs font-bold {achievement.placement === '1st' ? 'text-yellow-400' : 
												 achievement.placement === '2nd' ? 'text-gray-300' : 
												 achievement.placement === '3rd' ? 'text-orange-400' : 
												 'text-gray-500'}">
												{achievement.placement}
											</span>
											<span class="text-sm font-medium text-white truncate">
												{achievement.event}
											</span>
										</div>
										<p class="text-xs text-gray-500 mt-0.5">
											{formatDate(achievement.date)}
										</p>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="px-4 py-6 text-center">
							<p class="text-gray-500 text-sm">No achievements yet</p>
						</div>
					{/if}
				</div>
				
			</aside>
			
			<!-- Main Content - Teams & Tournaments -->
			<main class="lg:col-span-9 space-y-6">
				
				<!-- Current Teams Section -->
				{#if currentTeams.length > 0}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-2xl font-bold text-white">Current Teams</h2>
							<p class="text-sm text-gray-400 mt-1">2v2 League</p>
						</div>
						
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead class="bg-zinc-950/50">
									<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
										<th class="px-4 py-2 font-medium">Team</th>
										<th class="px-4 py-2 font-medium">Division</th>
										<th class="px-4 py-2 font-medium">Region</th>
										<th class="px-4 py-2 font-medium">Season</th>
										<th class="px-4 py-2 font-medium">Record</th>
										<th class="px-4 py-2 font-medium">Joined</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-zinc-800/50">
									{#each currentTeams as team}
										<tr class="hover:bg-zinc-800/30 transition-colors bg-green-500/5">
											<td class="px-4 py-2">
												<a 
													href="/teams/{team.teamId}" 
													class="text-white font-medium hover:text-blue-400 transition-colors text-sm"
												>
													{team.teamName}
												</a>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{team.division}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{team.regionName}</span>
											</td>
											<td class="px-4 py-2">
												<span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded border border-blue-500/30">
													S{team.seasonNum}
												</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-green-400 text-sm font-medium">{team.totalRecord}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-400 text-sm">{formatDate(team.joined)}</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
				
				<!-- Team History Section -->
				{#if teamHistory.length > 0}
					<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-2xl font-bold text-white">Team History</h2>
						</div>
						
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead class="bg-zinc-950/50">
									<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
										<th class="px-4 py-2 font-medium">Team</th>
										<th class="px-4 py-2 font-medium">Division</th>
										<th class="px-4 py-2 font-medium">Region</th>
										<th class="px-4 py-2 font-medium">Season</th>
										<th class="px-4 py-2 font-medium">Record</th>
										<th class="px-4 py-2 font-medium">Period</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-zinc-800/50">
									{#each teamHistory as team}
										<tr class="hover:bg-zinc-800/30 transition-colors opacity-60">
											<td class="px-4 py-2">
												<a 
													href="/teams/{team.teamId}" 
													class="text-white font-medium hover:text-blue-400 transition-colors text-sm"
												>
													{team.teamName}
												</a>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{team.division}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{team.regionName}</span>
											</td>
											<td class="px-4 py-2">
												<span class="px-2 py-0.5 bg-zinc-800 text-gray-400 text-xs rounded">
													S{team.seasonNum}
												</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-400 text-sm">{team.totalRecord}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-500 text-sm">{formatDate(team.joined)} - {formatDate(team.left)}</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
				
				<!-- Tournaments Section -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-2xl font-bold text-white">Tournaments</h2>
					</div>
					
					<div class="overflow-x-auto">
						{#if tournaments.length > 0}
							<table class="w-full">
								<thead class="bg-zinc-950/50">
									<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
										<th class="px-4 py-2 font-medium">Tournament</th>
										<th class="px-4 py-2 font-medium">Date</th>
										<th class="px-4 py-2 font-medium">Placement</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-zinc-800/50">
									{#each tournaments as tournament}
										<tr class="hover:bg-zinc-800/30 transition-colors">
											<td class="px-4 py-2">
												<span class="text-white font-medium text-sm">{tournament.name}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-400 text-sm">{formatDate(tournament.date)}</span>
											</td>
											<td class="px-4 py-2">
												<span class="{getPlacementColor(tournament.placement)} text-sm font-bold">
													{tournament.placement}
												</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<div class="px-6 py-8 text-center">
								<p class="text-gray-500 text-sm">No tournament participation recorded</p>
							</div>
						{/if}
					</div>
				</div>
				
				<!-- Fight Nights Section -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
					<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
						<h2 class="text-2xl font-bold text-white">Fight Nights</h2>
					</div>
					
					<div class="overflow-x-auto">
						{#if fightNights.length > 0}
							<table class="w-full">
								<thead class="bg-zinc-950/50">
									<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
										<th class="px-4 py-2 font-medium">Event</th>
										<th class="px-4 py-2 font-medium">Opponent</th>
										<th class="px-4 py-2 font-medium">Result</th>
										<th class="px-4 py-2 font-medium">Date</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-zinc-800/50">
									{#each fightNights as fight}
										<tr class="hover:bg-zinc-800/30 transition-colors">
											<td class="px-4 py-2">
												<a 
													href="/fightnight/{fight.id}"
													class="text-white font-medium text-sm hover:text-blue-400 transition-colors"
												>
													{fight.fightNightName}
												</a>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{fight.opponent}</span>
											</td>
											<td class="px-4 py-2">
												<span class="{getResultColor(fight.result)} text-sm font-bold">
													{fight.result} ({fight.score})
												</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-gray-400 text-sm">{formatDate(fight.date)}</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{:else}
							<div class="px-6 py-8 text-center">
								<p class="text-gray-500 text-sm">No Fight Night participation recorded</p>
							</div>
						{/if}
					</div>
				</div>
				
			</main>
			
		</div>
	</div>
</div>

