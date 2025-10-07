<script lang="ts">
	// Mock seasons data
	const seasons = [
		{ id: 4, seasonNum: 4, region: 'North America', numWeeks: 10, status: 'Active', teams: 42, startDate: '2025-09-01' },
		{ id: 3, seasonNum: 3, region: 'North America', numWeeks: 10, status: 'Completed', teams: 38, startDate: '2025-05-01' },
		{ id: 2, seasonNum: 2, region: 'Europe', numWeeks: 8, status: 'Active', teams: 24, startDate: '2025-08-15' },
		{ id: 1, seasonNum: 1, region: 'North America', numWeeks: 8, status: 'Completed', teams: 32, startDate: '2025-01-15' }
	];
	
	function getStatusColor(status: string) {
		if (status === 'Active') return 'bg-green-500/20 text-green-400';
		if (status === 'Completed') return 'bg-gray-500/20 text-gray-400';
		return 'bg-blue-500/20 text-blue-400';
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-3xl font-bold text-white mb-2">Season Management</h2>
			<p class="text-gray-400">Create and manage league seasons</p>
		</div>
		<button class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
			+ Create Season
		</button>
	</div>
	
	<!-- Seasons Grid -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		{#each seasons as season}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 hover:border-zinc-700 transition-colors">
				<div class="flex items-start justify-between mb-4">
					<div>
						<h3 class="text-2xl font-bold text-white mb-1">Season {season.seasonNum}</h3>
						<p class="text-gray-400">{season.region}</p>
					</div>
					<span class="px-3 py-1 rounded {getStatusColor(season.status)}">
						{season.status}
					</span>
				</div>
				
				<div class="space-y-3 mb-6">
					<div class="flex justify-between text-sm">
						<span class="text-gray-400">Duration</span>
						<span class="text-white">{season.numWeeks} weeks</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-gray-400">Teams</span>
						<span class="text-white">{season.teams} teams</span>
					</div>
					<div class="flex justify-between text-sm">
						<span class="text-gray-400">Start Date</span>
						<span class="text-white">{season.startDate}</span>
					</div>
				</div>
				
				<div class="flex gap-2">
					<button class="flex-1 px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors">
						View Details
					</button>
					<button class="flex-1 px-4 py-2 bg-zinc-800 text-gray-300 hover:bg-zinc-700 rounded transition-colors">
						Edit
					</button>
				</div>
			</div>
		{/each}
	</div>
	
	<!-- Create New Season Form (collapsed by default) -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
		<h3 class="text-xl font-bold text-white mb-4">Quick Start New Season</h3>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<div>
				<label for="seasonNum" class="block text-sm font-medium text-gray-300 mb-2">Season Number</label>
				<input
					id="seasonNum"
					type="number"
					placeholder="5"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
				/>
			</div>
			<div>
				<label for="region" class="block text-sm font-medium text-gray-300 mb-2">Region</label>
				<select
					id="region"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
				>
					<option>North America</option>
					<option>Europe</option>
				</select>
			</div>
			<div>
				<label for="numWeeks" class="block text-sm font-medium text-gray-300 mb-2">Number of Weeks</label>
				<input
					id="numWeeks"
					type="number"
					placeholder="10"
					class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
				/>
			</div>
			<div class="flex items-end">
				<button class="w-full px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors">
					Create Season
				</button>
			</div>
		</div>
	</div>
</div>

