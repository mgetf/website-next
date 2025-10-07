<script lang="ts">
	// Mock data for dashboard
	const stats = [
		{ label: 'Active Teams', value: '42', change: '+3', icon: '👥', color: 'blue' },
		{ label: 'Pending Approvals', value: '7', change: '+2', icon: '⏳', color: 'yellow' },
		{ label: 'Active Matches', value: '18', change: '+5', icon: '⚔️', color: 'green' },
		{ label: 'Open Disputes', value: '2', change: '-1', icon: '⚖️', color: 'red' }
	];
	
	const recentActivity = [
		{ type: 'team', message: 'Team "WARHAMMER" approved for Season 4', time: '5 minutes ago', user: 'ampere' },
		{ type: 'player', message: 'Player "ry4n" approved for team WARHAMMER', time: '12 minutes ago', user: 'ampere' },
		{ type: 'match', message: 'Match Week 8 created for Premier Division', time: '1 hour ago', user: 'system' },
		{ type: 'dispute', message: 'Dispute resolved for Match #156', time: '2 hours ago', user: 'moderator_name' },
		{ type: 'demo', message: 'Demo report #23 marked as reviewed', time: '3 hours ago', user: 'ampere' }
	];
	
	const quickActions = [
		{ label: 'Create Matches', href: '/admin/matches', icon: '⚔️', color: 'blue' },
		{ label: 'Approve Teams', href: '/admin/teams', icon: '✅', color: 'green' },
		{ label: 'Review Demos', href: '/admin/demos', icon: '📹', color: 'purple' },
		{ label: 'Manage Season', href: '/admin/seasons', icon: '🏆', color: 'orange' }
	];
	
	function getActivityIcon(type: string) {
		const icons: Record<string, string> = {
			team: '👥',
			player: '👤',
			match: '⚔️',
			dispute: '⚖️',
			demo: '📹'
		};
		return icons[type] || '📝';
	}
</script>

<div class="max-w-7xl mx-auto space-y-8">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Dashboard</h2>
		<p class="text-gray-400">Overview of league management and recent activity</p>
	</div>
	
	<!-- Stats Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		{#each stats as stat}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
				<div class="flex items-center justify-between mb-4">
					<span class="text-3xl">{stat.icon}</span>
					<span class="text-sm px-2 py-1 rounded {
						stat.change.startsWith('+') ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
					}">
						{stat.change}
					</span>
				</div>
				<div>
					<p class="text-3xl font-bold text-white mb-1">{stat.value}</p>
					<p class="text-sm text-gray-400">{stat.label}</p>
				</div>
			</div>
		{/each}
	</div>
	
	<!-- Quick Actions -->
	<div>
		<h3 class="text-xl font-bold text-white mb-4">Quick Actions</h3>
		<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
			{#each quickActions as action}
				<a
					href={action.href}
					class="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg p-6 text-center transition-all hover:scale-105"
				>
					<span class="text-4xl mb-3 block">{action.icon}</span>
					<span class="text-white font-medium">{action.label}</span>
				</a>
			{/each}
		</div>
	</div>
	
	<!-- Recent Activity -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg">
		<div class="px-6 py-4 border-b border-zinc-800">
			<h3 class="text-xl font-bold text-white">Recent Activity</h3>
		</div>
		<div class="p-6">
			<div class="space-y-4">
				{#each recentActivity as activity}
					<div class="flex items-start gap-4 pb-4 border-b border-zinc-800 last:border-b-0 last:pb-0">
						<span class="text-2xl mt-1">{getActivityIcon(activity.type)}</span>
						<div class="flex-1 min-w-0">
							<p class="text-white">{activity.message}</p>
							<div class="flex items-center gap-3 mt-1 text-sm text-gray-400">
								<span>{activity.time}</span>
								<span>•</span>
								<span>by {activity.user}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
	
	<!-- Current Season Info -->
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h3 class="text-xl font-bold text-white mb-4">Current Season</h3>
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="text-gray-400">Season</span>
					<span class="text-white font-medium">Season 4</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Region</span>
					<span class="text-white font-medium">North America</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Current Week</span>
					<span class="text-white font-medium">Week 8 / 10</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-400">Status</span>
					<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">Active</span>
				</div>
			</div>
		</div>
		
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
			<h3 class="text-xl font-bold text-white mb-4">System Status</h3>
			<div class="space-y-3">
				<div class="flex justify-between items-center">
					<span class="text-gray-400">Team Signups</span>
					<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">Open</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-gray-400">Match Submissions</span>
					<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">Enabled</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-gray-400">Payment Required</span>
					<span class="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-sm">Yes</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-gray-400">Database</span>
					<span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-sm">Connected</span>
				</div>
			</div>
		</div>
	</div>
</div>

