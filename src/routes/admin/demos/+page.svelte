<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	
	let { data }: { data: PageData } = $props();
	
	let showReviewed = $state(true);
	let showRejected = $state(true);
	let isSubmitting = $state(false);
	
	// Filter reports based on checkboxes
	let filteredReports = $derived(
		data.demoReports.filter(report => {
			if (report.status === 'REVIEW') return true; // Always show pending
			if (report.status === 'ACTION' && showReviewed) return true; // Reviewed (ACTION = reviewed/acted on)
			if (report.status === 'CLEAR' && showRejected) return true; // Rejected (CLEAR = cleared/rejected)
			return false;
		})
	);
	
	function getStatusLabel(status: string): string {
		switch (status) {
			case 'REVIEW': return 'Pending';
			case 'ACTION': return 'Reviewed';
			case 'CLEAR': return 'Rejected';
			default: return status;
		}
	}
	
	function getStatusColor(status: string): string {
		switch (status) {
			case 'REVIEW': return 'bg-yellow-500 text-black';
			case 'ACTION': return 'bg-green-500 text-white';
			case 'CLEAR': return 'bg-red-500 text-white';
			default: return 'bg-gray-500 text-white';
		}
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Demo Reports</h2>
		<p class="text-gray-400">Review and manage reported game demos</p>
	</div>
	
	<!-- Filters -->
	<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
		<div class="flex gap-6">
			<label class="flex items-center gap-2 text-gray-300 cursor-pointer">
				<input 
					type="checkbox" 
					bind:checked={showReviewed}
					class="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 focus:ring-orange-500"
				/>
				<span>Show Reviewed</span>
			</label>
			<label class="flex items-center gap-2 text-gray-300 cursor-pointer">
				<input 
					type="checkbox" 
					bind:checked={showRejected}
					class="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-orange-500 focus:ring-orange-500"
				/>
				<span>Show Rejected</span>
			</label>
		</div>
	</div>
	
	<!-- Reports List -->
	<div class="space-y-4">
		{#if filteredReports.length === 0}
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">📹</div>
				<h3 class="text-xl font-bold text-white mb-2">No Demo Reports</h3>
				<p class="text-gray-400">
					{data.demoReports.length === 0 
						? 'No demo reports have been submitted yet.'
						: 'No reports match your current filters.'}
				</p>
			</div>
		{:else}
			{#each filteredReports as report}
				<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
					<div class="flex items-start justify-between mb-4">
						<div class="space-y-2">
							<h3 class="text-lg font-bold text-white">
								Reported by:
								<a 
									href="/users/{report.reporter?.steamId}" 
									class="text-blue-400 hover:text-blue-300 transition-colors"
								>
									{report.reporter?.steamUsername || 'Unknown User'}
								</a>
							</h3>
							<p class="text-sm text-gray-400">
								Reported at: {new Date(report.reportedAt).toLocaleString()}
							</p>
						</div>
						
						<span class="px-3 py-1 text-sm font-medium rounded {getStatusColor(report.status)}">
							{getStatusLabel(report.status)}
						</span>
					</div>
					
					<!-- Report Details -->
					<div class="space-y-3 mb-4">
						<div>
							<h4 class="text-sm font-medium text-gray-400 mb-1">Player Reported:</h4>
							<a 
								href="/users/{report.demo.player?.steamId}" 
								class="text-blue-400 hover:text-blue-300 transition-colors"
							>
								{report.demo.player?.steamUsername || 'Unknown Player'}
							</a>
						</div>
						
						<div>
							<h4 class="text-sm font-medium text-gray-400 mb-1">Description:</h4>
							<p class="text-gray-200">{report.description || 'No description provided'}</p>
						</div>
						
						{#if report.adminComments}
							<div>
								<h4 class="text-sm font-medium text-gray-400 mb-1">Admin Comments:</h4>
								<p class="text-gray-200">{report.adminComments}</p>
							</div>
						{/if}
						
						{#if report.admin}
							<div>
								<h4 class="text-sm font-medium text-gray-400 mb-1">Reviewed by:</h4>
								<span class="text-gray-200">{report.admin.steamUsername}</span>
							</div>
						{/if}
					</div>
					
					<!-- Demo Link -->
					<div class="mb-4 flex items-center gap-3">
						<a 
							href={report.demo.file}
							target="_blank"
							class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors"
						>
							<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
							Download Demo
						</a>
						
						{#if report.demo.match}
							<a 
								href="/matches/{report.demo.match.id}"
								class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-md font-medium transition-colors"
							>
								View Match
							</a>
						{/if}
					</div>
					
					<!-- Update Form -->
					<form 
						method="POST" 
						action="?/updateReport"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
						class="border-t border-zinc-800 pt-4 space-y-3"
					>
						<input type="hidden" name="reportId" value={report.id} />
						
						<div class="flex gap-4">
							<div class="flex-1">
								<label for="status-{report.id}" class="block text-sm font-medium text-gray-300 mb-2">
									Status:
								</label>
								<select 
									id="status-{report.id}"
									name="status"
									value={report.status}
									class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
								>
									<option value="REVIEW">Pending</option>
									<option value="ACTION">Reviewed</option>
									<option value="CLEAR">Rejected</option>
								</select>
							</div>
							
							<div class="flex-1">
								<label for="comments-{report.id}" class="block text-sm font-medium text-gray-300 mb-2">
									Admin Comments:
								</label>
								<textarea 
									id="comments-{report.id}"
									name="adminComments"
									value={report.adminComments || ''}
									rows="1"
									placeholder="Leave a comment..."
									class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
								></textarea>
							</div>
						</div>
						
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
						>
							{isSubmitting ? 'Updating...' : 'Update Status'}
						</button>
					</form>
				</div>
			{/each}
		{/if}
	</div>
</div>

