<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	
	let { data }: { data: PageData } = $props();
	
	let isSubmitting = $state(false);
	
	function getStatusLabel(status: string): string {
		switch (status) {
			case 'UNPLAYED': return 'Not Played';
			case 'PLAYED': return 'Played';
			case 'DISPUTE': return 'Disputed';
			default: return status;
		}
	}
	
	function getStatusColor(status: string): string {
		switch (status) {
			case 'UNPLAYED': return 'bg-gray-500';
			case 'PLAYED': return 'bg-green-500';
			case 'DISPUTE': return 'bg-red-500';
			default: return 'bg-gray-500';
		}
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Disputed Matches</h2>
		<p class="text-gray-400">Review and resolve match disputes</p>
	</div>
	
	<!-- Disputed Matches List -->
	<div class="space-y-4">
		{#if data.disputedMatches.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">✅</div>
				<h3 class="text-xl font-bold text-white mb-2">No Disputed Matches</h3>
				<p class="text-gray-400">All matches have been resolved</p>
			</div>
		{:else}
			{#each data.disputedMatches as match}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="flex-1">
							<!-- Match Info -->
							<div class="flex items-center gap-3 mb-2">
								<h3 class="text-lg font-bold text-white">
									Match #{match.id}
								</h3>
								<span class="px-2 py-1 text-xs font-medium rounded {getStatusColor(match.status)} text-white">
									{getStatusLabel(match.status)}
								</span>
							</div>
							
							<!-- Teams -->
							<div class="flex items-center gap-3 mb-2">
								<a 
									href="/teams/{match.homeTeam.id}"
									class="text-orange-400 hover:text-orange-300 font-medium transition-colors"
								>
									{match.homeTeam.name}
								</a>
								<span class="text-gray-500">vs</span>
								<a 
									href="/teams/{match.awayTeam.id}"
									class="text-orange-400 hover:text-orange-300 font-medium transition-colors"
								>
									{match.awayTeam.name}
								</a>
							</div>
							
							<!-- Season & Result Info -->
							<div class="flex items-center gap-3 text-sm text-gray-400">
								<span>
									{match.season.region.name} - Season {match.season.seasonNum}
									{#if match.weekNo}, Week {match.weekNo}{/if}
								</span>
								{#if match.winner}
									<span>•</span>
									<span class="text-gray-300">
										Winner: {match.winner.name} ({match.winnerScore}-{match.loserScore})
									</span>
								{/if}
							</div>
						</div>
						
						<!-- View Match Button -->
						<a 
							href="/matches/{match.id}"
							class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors"
						>
							View Details
						</a>
					</div>
					
					<!-- Resolution Form -->
					<form 
						method="POST" 
						action="?/resolveDispute"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
						class="border-t border-zinc-800 pt-4 flex items-center gap-3"
					>
						<input type="hidden" name="matchId" value={match.id} />
						
						<label for="status-{match.id}" class="text-sm font-medium text-gray-300">
							Resolve Dispute:
						</label>
						
						<select 
							id="status-{match.id}"
							name="status"
							class="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
						>
							<option value="PLAYED">Mark as Played (Accept Result)</option>
							<option value="UNPLAYED">Mark as Unplayed (Reset Match)</option>
						</select>
						
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
						>
							{isSubmitting ? 'Resolving...' : 'Resolve'}
						</button>
					</form>
				</div>
			{/each}
		{/if}
	</div>
</div>

