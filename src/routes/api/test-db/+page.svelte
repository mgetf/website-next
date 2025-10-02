<script lang="ts">
	import { onMount } from 'svelte';

	let loading = $state(true);
	let data = $state<any>(null);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const response = await fetch('/api/test-db');
			data = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to fetch';
		} finally {
			loading = false;
		}
	});
</script>

<div class="container mx-auto p-8 max-w-4xl">
	<h1 class="text-3xl font-bold mb-6">Database Connection Test</h1>

	{#if loading}
		<div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
			<p>Testing database connection...</p>
		</div>
	{:else if error}
		<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
			<h2 class="font-bold">Error</h2>
			<p>{error}</p>
		</div>
	{:else if data}
		{#if data.success}
			<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
				<h2 class="font-bold text-xl mb-2">✅ {data.message}</h2>
				<p class="text-sm">Tested at: {data.timestamp}</p>
			</div>

			<div class="bg-white shadow-md rounded px-8 py-6">
				<h3 class="text-xl font-semibold mb-4">Database Statistics</h3>
				<p class="mb-4">
					<span class="font-medium">Total Users:</span>
					{data.stats.userCount}
				</p>

				{#if data.stats.sampleUsers && data.stats.sampleUsers.length > 0}
					<h4 class="font-medium mb-2">Sample Users:</h4>
					<div class="overflow-x-auto">
						<table class="min-w-full table-auto border-collapse border border-gray-300">
							<thead>
								<tr class="bg-gray-100">
									<th class="border border-gray-300 px-4 py-2 text-left">Steam ID</th>
									<th class="border border-gray-300 px-4 py-2 text-left">Username</th>
									<th class="border border-gray-300 px-4 py-2 text-left">Permission</th>
									<th class="border border-gray-300 px-4 py-2 text-left">Ban Status</th>
								</tr>
							</thead>
							<tbody>
								{#each data.stats.sampleUsers as user}
									<tr class="hover:bg-gray-50">
										<td class="border border-gray-300 px-4 py-2 font-mono text-sm">
											{user.steamId}
										</td>
										<td class="border border-gray-300 px-4 py-2">{user.steamUsername}</td>
										<td class="border border-gray-300 px-4 py-2">{user.permissionLevel}</td>
										<td class="border border-gray-300 px-4 py-2">{user.banStatus}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<p class="text-gray-600 italic">No users found in database yet.</p>
				{/if}
			</div>
		{:else}
			<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
				<h2 class="font-bold">Database Connection Failed</h2>
				<p>{data.message}</p>
				{#if data.error}
					<pre class="mt-2 text-sm bg-red-50 p-2 rounded">{data.error}</pre>
				{/if}
			</div>
		{/if}
	{/if}
</div>


