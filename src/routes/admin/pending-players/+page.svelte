<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	
	let { data }: { data: PageData } = $props();
	
	let isSubmitting = $state(false);
	let decliningPlayerId = $state<string | null>(null);
	let declineReasons = $state<Record<string, string>>({});
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Pending Players</h2>
		<p class="text-gray-400">Approve or deny team join requests</p>
	</div>
	
	<!-- Pending Requests -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800">
		{#if data.pendingPlayers.length === 0}
			<div class="py-12 text-center">
				<span class="text-6xl mb-4 block">✅</span>
				<p class="text-gray-400">No pending player requests</p>
			</div>
		{:else}
			{#each data.pendingPlayers as request}
				<div class="p-4 hover:bg-zinc-800/50 transition-colors">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<!-- Player Avatar -->
							<a href="/users/{request.player.steamId}">
								<img
									src={request.player.steamAvatar || '/default-avatar.png'}
									alt={request.player.steamUsername}
									class="w-12 h-12 rounded-lg hover:opacity-80 transition-opacity"
								/>
							</a>
							
							<!-- Request Details -->
							<div>
								<div class="flex items-center gap-3 mb-1">
									<a 
										href="/users/{request.player.steamId}"
										class="text-white font-semibold hover:text-blue-400 transition-colors"
									>
										{request.player.steamUsername}
									</a>
									<span class="text-gray-500">→</span>
									<a 
										href="/teams/{request.team.id}" 
										class="text-orange-400 hover:text-orange-300 font-medium transition-colors"
									>
										{request.team.name}
									</a>
								</div>
								<div class="flex items-center gap-3 text-sm text-gray-400">
									<span>{request.team.division?.name || 'No Division'}</span>
								</div>
							</div>
						</div>
						
						<!-- Actions -->
						<div class="flex items-center gap-3">
							{#if decliningPlayerId === request.player.steamId}
								<!-- Decline Form -->
								<form 
									method="POST" 
									action="?/decline"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
											decliningPlayerId = null;
											declineReasons[request.player.steamId] = '';
										};
									}}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="playerSteamId" value={request.player.steamId} />
									<input type="hidden" name="teamId" value={request.team.id} />
									<input
										type="text"
										name="reason"
										bind:value={declineReasons[request.player.steamId]}
										placeholder="Reason for decline..."
										required
										class="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
									/>
									<button
										type="submit"
										disabled={isSubmitting}
										class="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
									>
										Confirm
									</button>
									<button
										type="button"
										onclick={() => decliningPlayerId = null}
										class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors font-medium text-sm"
									>
										Cancel
									</button>
								</form>
							{:else}
								<!-- Approve Button -->
								<form 
									method="POST" 
									action="?/approve"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
										};
									}}
								>
									<input type="hidden" name="playerSteamId" value={request.player.steamId} />
									<input type="hidden" name="teamId" value={request.team.id} />
									<button
										type="submit"
										disabled={isSubmitting}
										class="px-6 py-2 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors font-medium disabled:opacity-50"
									>
										✓ Approve
									</button>
								</form>
								
								<!-- Decline Button -->
								<button
									onclick={() => decliningPlayerId = request.player.steamId}
									class="px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors font-medium"
								>
									✗ Decline
								</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

