<script lang="ts">
	// Mock data - will be replaced with real data later
	const seasons = [
		{ id: 2, name: 'Season 2', active: true },
		{ id: 1, name: 'Season 1', active: false }
	];
	
	const regions = [
		{ id: 'na', name: 'North America' },
		{ id: 'eu', name: 'Europe' },
		{ id: 'sa', name: 'South America' }
	];
	
	let selectedSeason = $state(2);
	let selectedRegion = $state('na');
	
	// Mock staff data organized by division
	const staffByDivision = [
		{
			division: 'INVITE (NA)',
			staff: [
				{ role: 'Head Admin', name: 'arcadia', steamId: '76561198000000001' },
				{ role: 'Head Admin', name: 'Kitt(eh)', steamId: '76561198000000002' },
				{ role: 'Head Admin', name: 'Neptune', steamId: '76561198000000003' },
				{ role: 'Head Admin', name: 'serenix', steamId: '76561198000000004' },
				{ role: 'Head Admin', name: 'tommy', steamId: '76561198000000005' }
			]
		},
		{
			division: 'PREMIER (EU)',
			staff: [
				{ role: 'Head Admin', name: 'mrose', steamId: '76561198000000006' },
				{ role: 'Head Admin', name: 'Richochet Lover', steamId: '76561198000000007' }
			]
		},
		{
			division: 'INTERMEDIATE',
			staff: [
				{ role: 'Head Admin', name: 'Crustacean Se...', steamId: '76561198000000008' },
				{ role: 'Moderator', name: 'Keyin0', steamId: '76561198000000009' }
			]
		},
		{
			division: 'OPEN',
			staff: [
				{ role: 'Head Admin', name: 'dynamyc', steamId: '76561198000000010' },
				{ role: 'Moderator', name: 'AC', steamId: '76561198000000011' }
			]
		},
		{
			division: 'NEWCOMER',
			staff: [
				{ role: 'Moderator', name: '-StreX', steamId: '76561198000000012' },
				{ role: 'Moderator', name: 'Kubusiek3', steamId: '76561198000000013' },
				{ role: 'Moderator', name: 'Zora', steamId: '76561198000000014' }
			]
		}
	];
	
	const deadlines = {
		registration: { date: new Date('2025-03-15'), open: false },
		payment: { date: new Date('2025-03-20'), open: false },
		seasonStart: { date: new Date('2025-04-01') }
	};
	
	const divisions = [
		{
			name: 'Premier',
			color: 'blue',
			teams: [
				{ id: 5, rank: 1, name: 'WARHAMMER', wins: 2, losses: 0, points: 20.0, streak: 'W2' },
				{ id: 6, rank: 2, name: 'PRO PIRO', wins: 2, losses: 0, points: 20.0, streak: 'W2' },
				{ id: 7, rank: 3, name: 'мирин', wins: 2, losses: 0, points: 20.0, streak: 'W2' },
				{ id: 8, rank: 4, name: 'Team Alpha', wins: 1, losses: 1, points: 10.0, streak: 'L1' },
				{ id: 9, rank: 5, name: 'Apex Legends', wins: 0, losses: 2, points: 0.0, streak: 'L2' }
			]
		},
		{
			name: 'Intermediate',
			color: 'purple',
			teams: [
				{ id: 10, rank: 1, name: 'Rising Stars', wins: 3, losses: 0, points: 30.0, streak: 'W3' },
				{ id: 11, rank: 2, name: 'Team Beta', wins: 2, losses: 1, points: 20.0, streak: 'W1' },
				{ id: 12, rank: 3, name: 'The Grinders', wins: 1, losses: 2, points: 10.0, streak: 'L1' }
			]
		},
		{
			name: 'Open',
			color: 'green',
			teams: [
				{ id: 13, rank: 1, name: 'Newbies United', wins: 2, losses: 0, points: 20.0, streak: 'W2' },
				{ id: 14, rank: 2, name: 'Team Gamma', wins: 1, losses: 1, points: 10.0, streak: 'W1' },
				{ id: 15, rank: 3, name: 'Fresh Faces', wins: 0, losses: 2, points: 0.0, streak: 'L2' }
			]
		}
	];
	
	let selectedDivision = $state('Premier');
	
	// Calculate time remaining for deadlines
	function getTimeRemaining(date: Date) {
		const now = new Date();
		const diff = date.getTime() - now.getTime();
		
		if (diff <= 0) return 'Closed';
		
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
		
		if (days > 0) return `${days}d ${hours}h`;
		return `${hours}h`;
	}
	
	function getDivisionColor(color: string) {
		const colors = {
			blue: 'border-blue-500 hover:border-blue-400',
			purple: 'border-purple-500 hover:border-purple-400',
			green: 'border-green-500 hover:border-green-400'
		};
		return colors[color as keyof typeof colors] || colors.blue;
	}
	
	function getDivisionBadgeColor(color: string) {
		const colors = {
			blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
			purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
			green: 'bg-green-500/20 text-green-400 border-green-500/30'
		};
		return colors[color as keyof typeof colors] || colors.blue;
	}
</script>

<div class="min-h-screen pb-16">
	<!-- Hero Header -->
	<section class="relative py-16 px-6 text-center bg-gradient-to-b from-zinc-950 to-zinc-900">
		<div class="max-w-7xl mx-auto">
		<h1 class="text-6xl font-black mb-12 text-white drop-shadow-2xl">
			2v2 MGE League
		</h1>
		
		<!-- Region & Season Controls -->
		<div class="flex items-start justify-center gap-8">
			<div class="flex flex-col items-center gap-2">
				<span class="text-sm font-medium text-gray-400">Region</span>
				<div class="flex gap-2">
					{#each regions as region}
						<button
							onclick={() => selectedRegion = region.id}
							class="px-6 py-2 rounded font-medium transition-all {selectedRegion === region.id 
								? 'bg-zinc-700 text-white border border-zinc-600' 
								: 'bg-zinc-900 text-gray-300 hover:bg-zinc-800 border border-zinc-800'}"
						>
							{region.id.toUpperCase()}
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
					{#each seasons as season}
						<option value={season.id}>{season.name}</option>
					{/each}
				</select>
			</div>
		</div>
		</div>
	</section>

	<!-- Main Content with Sidebars -->
	<div class="max-w-[1600px] mx-auto px-6 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
			
			<!-- Left Sidebar - Deadlines -->
			<aside class="lg:col-span-3 space-y-4">
				<!-- Team Registration Deadline -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-3">Team Registration Closes</h3>
					<div class="text-4xl font-black text-red-500 mb-4">CLOSED</div>
				</div>
				
				<!-- Payments Due -->
				<div class="bg-zinc-900/80 backdrop-blur rounded-lg border border-zinc-800 p-6">
					<h3 class="text-sm font-medium text-gray-400 mb-4">Payments Due</h3>
					
					<div class="space-y-4">
						<div>
							<div class="text-xs text-gray-500 mb-1">NA (EST)</div>
							<div class="text-3xl font-black text-red-500">CLOSED</div>
						</div>
						
						<div class="border-t border-zinc-800 pt-4">
							<div class="text-xs text-gray-500 mb-1">EU (CET)</div>
							<div class="text-3xl font-black text-red-500">CLOSED</div>
						</div>
					</div>
				</div>
			</aside>
			
			<!-- Center - Division Tables -->
			<main class="lg:col-span-6 space-y-8">
				{#each divisions as division}
					<div class="bg-zinc-900/50 backdrop-blur rounded-lg border border-zinc-800 overflow-hidden">
						<!-- Division Header -->
						<div class="bg-zinc-950/80 px-6 py-4 border-b border-zinc-800">
							<h2 class="text-2xl font-bold text-white uppercase tracking-wide">
								{division.name} <span class="text-gray-500">({selectedRegion.toUpperCase()})</span>
							</h2>
						</div>
						
						<!-- Standings Table -->
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead class="bg-zinc-950/50">
									<tr class="text-left text-xs text-gray-400 uppercase tracking-wider">
										<th class="px-4 py-2 font-medium">Team</th>
										<th class="px-4 py-2 font-medium">Record</th>
										<th class="px-4 py-2 font-medium">Avg Points</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-zinc-800/50">
									{#each division.teams as team}
										<tr class="hover:bg-zinc-800/30 transition-colors">
									<td class="px-4 py-2">
										<a href="/teams/{team.id}" class="flex items-center gap-2 text-white text-sm font-medium hover:text-blue-400 transition-colors">
											<img 
												src="https://picsum.photos/seed/{team.name}/32" 
												alt="{team.name} logo" 
												class="w-8 h-8 rounded object-cover"
											/>
											<span>{team.name}</span>
										</a>
									</td>
											<td class="px-4 py-2">
												<span class="text-gray-300 text-sm">{team.wins} - {team.losses}</span>
											</td>
											<td class="px-4 py-2">
												<span class="text-white text-sm font-medium">{team.points.toFixed(1)}</span>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/each}
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
						{#each staffByDivision as divisionStaff}
							<div class="border-b border-zinc-800/50 last:border-0">
								<!-- Division Header -->
								<div class="px-4 py-2 bg-zinc-950/50">
									<h4 class="text-xs font-bold text-gray-400 uppercase tracking-wider">
										{divisionStaff.division}
									</h4>
								</div>
								
								<!-- Staff Members -->
								<div class="px-4 py-2 space-y-2">
									{#each divisionStaff.staff as member}
										<a 
											href="/player/{member.steamId}"
											class="flex items-center justify-between py-2 hover:bg-zinc-800/30 rounded px-2 -mx-2 transition-colors group"
										>
											<div class="flex items-center gap-2">
												<img 
													src="https://picsum.photos/seed/{member.name}/32" 
													alt="{member.name}" 
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
					</div>
				</div>
			</aside>
			
		</div>
	</div>
</div>

