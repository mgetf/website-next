<script lang="ts">
	import type { PageData } from './$types';
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import DoughnutChart from '$lib/components/charts/DoughnutChart.svelte';

	let { data }: { data: PageData } = $props();

	const analytics = $derived(data.analytics);
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-white mb-2">Dashboard</h1>
		<p class="text-gray-400">League statistics for active seasons</p>
	</div>

	<!-- Key Metrics Cards -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		<!-- Total Players -->
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
			<div class="text-4xl font-bold text-blue-400 mb-2">
				{analytics.totalPlayers}
			</div>
			<div class="text-sm text-gray-400">Active Players</div>
		</div>

		<!-- Total Teams -->
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
			<div class="text-4xl font-bold text-blue-400 mb-2">
				{analytics.totalTeams}
			</div>
			<div class="text-sm text-gray-400">Active Teams</div>
		</div>

		<!-- Payment Rate -->
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
			<div class="text-4xl font-bold text-green-400 mb-2">
				{analytics.paymentStatus.paymentRate}%
			</div>
			<div class="text-sm text-gray-400">Payment Rate</div>
		</div>

		<!-- Active Seasons -->
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-6">
			<div class="text-4xl font-bold text-blue-400 mb-2">
				{analytics.activeSeasonCount}
			</div>
			<div class="text-sm text-gray-400">Active Seasons</div>
		</div>
	</div>

	<!-- Administrative Alerts -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		<!-- Pending Players -->
		<a
			href="/admin/pending-players"
			class="bg-zinc-800 border border-zinc-700 rounded-lg p-6 hover:bg-zinc-750 transition group"
		>
			<div class="flex items-center justify-between mb-2">
				<div class="text-2xl font-bold text-yellow-400">
					{analytics.keyMetrics.pendingPlayers}
				</div>
				<svg
					class="w-6 h-6 text-gray-400 group-hover:text-yellow-400 transition"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 8l4 4m0 0l-4 4m4-4H3"
					/>
				</svg>
			</div>
			<div class="text-sm text-gray-400">Pending Players</div>
			<div class="text-xs text-gray-500 mt-1">Click to review</div>
		</a>

		<!-- Disputed Matches -->
		<a
			href="/admin/disputes"
			class="bg-zinc-800 border border-zinc-700 rounded-lg p-6 hover:bg-zinc-750 transition group"
		>
			<div class="flex items-center justify-between mb-2">
				<div class="text-2xl font-bold text-orange-400">
					{analytics.keyMetrics.disputedMatches}
				</div>
				<svg
					class="w-6 h-6 text-gray-400 group-hover:text-orange-400 transition"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 8l4 4m0 0l-4 4m4-4H3"
					/>
				</svg>
			</div>
			<div class="text-sm text-gray-400">Disputed Matches</div>
			<div class="text-xs text-gray-500 mt-1">Click to resolve</div>
		</a>

		<!-- Open Demo Reports -->
		<a
			href="/admin/demos"
			class="bg-zinc-800 border border-zinc-700 rounded-lg p-6 hover:bg-zinc-750 transition group"
		>
			<div class="flex items-center justify-between mb-2">
				<div class="text-2xl font-bold text-red-400">
					{analytics.keyMetrics.openDemoReports}
				</div>
				<svg
					class="w-6 h-6 text-gray-400 group-hover:text-red-400 transition"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M17 8l4 4m0 0l-4 4m4-4H3"
					/>
				</svg>
			</div>
			<div class="text-sm text-gray-400">Open Demo Reports</div>
			<div class="text-xs text-gray-500 mt-1">Click to review</div>
		</a>
	</div>

	<!-- Players Per Division -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6">
		<h2 class="text-2xl font-bold text-white mb-4">Players Per Division</h2>

		{#if analytics.playersPerDivision.length > 0}
			<div class="mb-6">
				<BarChart
					labels={analytics.playersPerDivision.map((d) => d.divisionName)}
					data={analytics.playersPerDivision.map((d) => d.playerCount)}
					title="Players"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-zinc-800 border-b border-zinc-700">
						<tr>
							<th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Division</th>
							<th class="px-4 py-3 text-right text-sm font-semibold text-gray-300">Players</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each analytics.playersPerDivision as division}
							<tr class="hover:bg-zinc-800/50 transition">
								<td class="px-4 py-3 text-sm text-white">{division.divisionName}</td>
								<td class="px-4 py-3 text-sm text-gray-300 text-right font-mono">
									{division.playerCount}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="text-gray-400 text-center py-8">No active players in current seasons</p>
		{/if}
	</div>

	<!-- Teams Per Region -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6">
		<h2 class="text-2xl font-bold text-white mb-4">Teams Per Region</h2>

		{#if analytics.teamsPerRegion.length > 0}
			<div class="mb-6">
				<BarChart
					labels={analytics.teamsPerRegion.map((r) => r.regionName)}
					data={analytics.teamsPerRegion.map((r) => r.teamCount)}
					title="Teams"
				/>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-zinc-800 border-b border-zinc-700">
						<tr>
							<th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Region</th>
							<th class="px-4 py-3 text-right text-sm font-semibold text-gray-300">Teams</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each analytics.teamsPerRegion as region}
							<tr class="hover:bg-zinc-800/50 transition">
								<td class="px-4 py-3 text-sm text-white">{region.regionName}</td>
								<td class="px-4 py-3 text-sm text-gray-300 text-right font-mono">
									{region.teamCount}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="text-gray-400 text-center py-8">No active teams in current seasons</p>
		{/if}
	</div>

	<!-- Payment Status -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg shadow-md p-6">
		<h2 class="text-2xl font-bold text-white mb-4">Payment Status</h2>

		{#if analytics.paymentStatus.totalInPaidDivisions > 0}
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<!-- Chart -->
				<div class="flex items-center justify-center">
					<DoughnutChart
						labels={['Paid', 'Unpaid', 'Free Tier']}
						data={[
							analytics.paymentStatus.paid,
							analytics.paymentStatus.unpaid,
							analytics.paymentStatus.freeTier
						]}
					/>
				</div>

				<!-- Stats Grid -->
				<div class="grid grid-cols-2 gap-4">
					<!-- Paid -->
					<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
						<div class="text-2xl font-bold text-green-400 mb-1">
							{analytics.paymentStatus.paid}
						</div>
						<div class="text-xs text-gray-400">Paid Players</div>
					</div>

					<!-- Unpaid -->
					<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
						<div class="text-2xl font-bold text-red-400 mb-1">
							{analytics.paymentStatus.unpaid}
						</div>
						<div class="text-xs text-gray-400">Unpaid Players</div>
					</div>

					<!-- Free Tier -->
					<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
						<div class="text-2xl font-bold text-blue-400 mb-1">
							{analytics.paymentStatus.freeTier}
						</div>
						<div class="text-xs text-gray-400">Free Tier</div>
					</div>

					<!-- Total in Paid Divisions -->
					<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
						<div class="text-2xl font-bold text-gray-300 mb-1">
							{analytics.paymentStatus.totalInPaidDivisions}
						</div>
						<div class="text-xs text-gray-400">Total (Paid Divs)</div>
					</div>
				</div>
			</div>
		{:else}
			<p class="text-gray-400 text-center py-8">No payment data available for current seasons</p>
		{/if}
	</div>

	<!-- Footer Note -->
	<div class="text-center text-sm text-gray-500 mt-8">
		Statistics are calculated from active seasons only
	</div>
</div>
