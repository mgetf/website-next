<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	let editingAnnouncement: typeof data.announcements[0] | null = $state(null);
	let deletingAnnouncement: typeof data.announcements[0] | null = $state(null);
	let isSubmitting = $state(false);
	
	function toggleEditForm(announcement: typeof data.announcements[0]) {
		if (editingAnnouncement?.id === announcement.id) {
			editingAnnouncement = null;
		} else {
			editingAnnouncement = announcement;
		}
	}
</script>

<div class="max-w-7xl mx-auto space-y-6">
	<!-- Page Header -->
	<div>
		<h2 class="text-3xl font-bold text-white mb-2">Global Configuration</h2>
		<p class="text-gray-400">Manage site-wide settings and announcements</p>
	</div>
	
	<!-- Success/Error Messages -->
	{#if form?.success}
		<div class="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
			<p class="text-green-400 font-medium">{form.message}</p>
		</div>
	{/if}
	
	{#if form?.error}
		<div class="bg-red-500/20 border border-red-500/30 rounded-lg p-4">
			<p class="text-red-400 font-medium">{form.error}</p>
		</div>
	{/if}
	
	<!-- Section 1: Global Announcements -->
	<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-6">
		<div class="border-b border-zinc-800 pb-4">
			<h3 class="text-2xl font-bold text-white mb-2">Global Announcements</h3>
			<p class="text-gray-400">Manage homepage announcement banners</p>
		</div>
		
		<!-- Create Announcement Form -->
		<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
			<form 
				method="POST" 
				action="?/createAnnouncement"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="content" class="block text-sm font-medium text-gray-300 mb-2">
						New Announcement
					</label>
					<textarea
						id="content"
						name="content"
						rows="3"
						maxlength="500"
						required
						class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
						placeholder="Enter announcement text (max 500 characters)..."
					></textarea>
				</div>
				<button
					type="submit"
					disabled={isSubmitting}
					class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? 'Creating...' : 'Create Announcement'}
				</button>
			</form>
		</div>
		
		<!-- Announcements List -->
		<div class="space-y-3">
			{#if data.announcements.length === 0}
				<div class="text-center py-12 text-gray-500">
					<p class="text-lg mb-2">No announcements yet</p>
					<p class="text-sm">Create your first announcement above</p>
				</div>
			{:else}
				{#each data.announcements as announcement}
					<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
						<div class="flex flex-col space-y-3">
							<!-- Announcement Content -->
							<div class="flex items-start justify-between gap-4">
								<p class="text-gray-200 flex-1">{announcement.content}</p>
								<div class="flex items-center gap-2 flex-shrink-0">
									<!-- Toggle Visibility -->
									<form 
										method="POST" 
										action="?/toggleVisibility"
										use:enhance={() => {
											isSubmitting = true;
											return async ({ update }) => {
												await update();
												isSubmitting = false;
											};
										}}
										class="inline"
									>
										<input type="hidden" name="id" value={announcement.id} />
										<input type="hidden" name="visible" value={announcement.visible === 1 ? '0' : '1'} />
										<button
											type="submit"
											disabled={isSubmitting}
											class="px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 {
												announcement.visible === 1
													? 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
													: 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 border border-gray-500/30'
											}"
										>
											{announcement.visible === 1 ? 'Hide' : 'Show'}
										</button>
									</form>
									
									<!-- Edit Button -->
									<button
										onclick={() => toggleEditForm(announcement)}
										class="px-3 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/30 rounded text-sm font-medium transition-colors"
									>
										Edit
									</button>
									
									<!-- Delete Button -->
									<button
										onclick={() => deletingAnnouncement = announcement}
										class="px-3 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded text-sm font-medium transition-colors"
									>
										Delete
									</button>
								</div>
							</div>
							
							<!-- Edit Form (Hidden by default) -->
							{#if editingAnnouncement?.id === announcement.id}
								<form 
									method="POST" 
									action="?/editAnnouncement"
									use:enhance={() => {
										isSubmitting = true;
										return async ({ update }) => {
											await update();
											isSubmitting = false;
											editingAnnouncement = null;
										};
									}}
									class="space-y-3 pt-3 border-t border-zinc-700"
								>
									<input type="hidden" name="id" value={announcement.id} />
									<textarea
										name="content"
										rows="3"
										maxlength="500"
										required
										class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
										value={announcement.content}
									></textarea>
									<div class="flex gap-2">
										<button
											type="submit"
											disabled={isSubmitting}
											class="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
										>
											{isSubmitting ? 'Saving...' : 'Save'}
										</button>
										<button
											type="button"
											onclick={() => editingAnnouncement = null}
											class="px-3 py-1 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded text-sm font-medium transition-colors"
										>
											Cancel
										</button>
									</div>
								</form>
							{/if}
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</section>
	
	<!-- Section 2: Global Settings (Placeholder for F26) -->
	<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-6">
		<div class="border-b border-zinc-800 pb-4">
			<h3 class="text-2xl font-bold text-white mb-2">Global Settings</h3>
			<p class="text-gray-400">Control roster locks, signup status, and season assignments</p>
		</div>
		
		<div class="text-center py-12 text-gray-500">
			<div class="text-6xl mb-4">⚙️</div>
			<h4 class="text-xl font-bold text-white mb-2">Coming Soon</h4>
			<p class="text-gray-400 mb-4">
				Global settings features are currently under development.
			</p>
			<div class="pt-6 border-t border-zinc-800 mt-6 max-w-md mx-auto">
				<p class="text-sm text-gray-500 mb-2">Features in development:</p>
				<ul class="text-sm text-gray-400 space-y-1">
					<li>• Roster lock controls (lock/unlock roster changes)</li>
					<li>• Signup lock controls (open/close team signups)</li>
					<li>• Payment requirement toggle</li>
					<li>• League fees configuration</li>
					<li>• Active signup seasons per region (NA, EU, AUS, SA, ASIA)</li>
				</ul>
			</div>
		</div>
	</section>
</div>

<!-- Delete Confirmation Modal -->
{#if deletingAnnouncement}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Delete Announcement</h3>
			<p class="text-gray-400 mb-6">
				Are you sure you want to delete this announcement? This action cannot be undone.
			</p>
			<div class="bg-zinc-800 border border-zinc-700 rounded p-3 mb-6">
				<p class="text-gray-300 text-sm">{deletingAnnouncement.content}</p>
			</div>
			<div class="flex gap-3">
				<form 
					method="POST" 
					action="?/deleteAnnouncement"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
							deletingAnnouncement = null;
						};
					}}
					class="flex-1"
				>
					<input type="hidden" name="id" value={deletingAnnouncement.id} />
					<button
						type="submit"
						disabled={isSubmitting}
						class="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
					>
						{isSubmitting ? 'Deleting...' : 'Delete'}
					</button>
				</form>
				<button
					type="button"
					onclick={() => deletingAnnouncement = null}
					class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-md font-medium transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

