<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	
	let { data, form }: { data: PageData; form: ActionData } = $props();
	
	let editingAnnouncement: typeof data.announcements[0] | null = $state(null);
	let deletingAnnouncement: typeof data.announcements[0] | null = $state(null);
	let isSubmitting = $state(false);
	let showSeasonAssignmentWarning = $state(false);
	let seasonAssignmentForm: HTMLFormElement | null = $state(null);
	// Filter regions that have at least one season for the given format
	function getRegionsWithSeasonsForFormat(formatId: number) {
		return data.regions.filter((region: { name: string }) => {
			const regionSeasons = data.seasonsByRegion[region.name] || [];
			return regionSeasons.some((s: { formatId: number }) => s.formatId === formatId);
		});
	}
	
	// Find the first format that has regions with seasons
	function getFirstAvailableFormatId(): number {
		const formatWithSeasons = data.formats.find((format: { id: number }) => 
			getRegionsWithSeasonsForFormat(format.id).length > 0
		);
		return formatWithSeasons?.id || data.formats[0]?.id || 2;
	}
	
	let selectedFormatId = $state(getFirstAvailableFormatId());
	
	// Get seasons for a region filtered by format
	function getSeasonsForRegionAndFormat(regionName: string, formatId: number) {
		const regionSeasons = data.seasonsByRegion[regionName] || [];
		return regionSeasons.filter((s: { formatId: number }) => s.formatId === formatId);
	}
	
	// Check if any format has regions with seasons
	function hasAnyRegionsWithSeasons() {
		return data.formats.some((format: { id: number }) => 
			getRegionsWithSeasonsForFormat(format.id).length > 0
		);
	}
	
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
	
	<!-- Section 2: Global Settings -->
	<section class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-6">
		<div class="border-b border-zinc-800 pb-4">
			<h3 class="text-2xl font-bold text-white mb-2">Global Settings</h3>
			<p class="text-gray-400">Control roster locks, signup status, and season assignments</p>
		</div>
		
		{#if data.globalSettings}
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<!-- Roster Lock Control -->
				<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
					<h4 class="text-lg font-bold text-white mb-3">
						Roster Lock Status: 
						<span class="{data.globalSettings.rosterLocked === 1 ? 'text-red-400' : 'text-green-400'}">
							{data.globalSettings.rosterLocked === 1 ? 'LOCKED' : 'OPEN'}
						</span>
					</h4>
					<p class="text-sm text-gray-400 mb-4">
						{data.globalSettings.rosterLocked === 1 
							? 'Teams cannot make roster changes'
							: 'Teams can freely modify their rosters'}
					</p>
					<form 
						method="POST" 
						action="?/toggleRoster"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 {
								data.globalSettings.rosterLocked === 1
									? 'bg-green-600 hover:bg-green-500 text-white'
									: 'bg-red-600 hover:bg-red-500 text-white'
							}"
						>
							{data.globalSettings.rosterLocked === 1 ? 'Unlock Rosters' : 'Lock Rosters'}
						</button>
					</form>
				</div>
				
				<!-- Signup Lock Control -->
				<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
					<h4 class="text-lg font-bold text-white mb-3">
						Signup Status: 
						<span class="{data.globalSettings.signupClosed === 1 ? 'text-red-400' : 'text-green-400'}">
							{data.globalSettings.signupClosed === 1 ? 'CLOSED' : 'OPEN'}
						</span>
					</h4>
					<p class="text-sm text-gray-400 mb-4">
						{data.globalSettings.signupClosed === 1 
							? 'New team signups are disabled'
							: 'New teams can register'}
					</p>
					<form 
						method="POST" 
						action="?/toggleSignup"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 {
								data.globalSettings.signupClosed === 1
									? 'bg-green-600 hover:bg-green-500 text-white'
									: 'bg-red-600 hover:bg-red-500 text-white'
							}"
						>
							{data.globalSettings.signupClosed === 1 ? 'Open Signups' : 'Close Signups'}
						</button>
					</form>
				</div>
				
				<!-- Payment Required Control -->
				<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
					<h4 class="text-lg font-bold text-white mb-3">
						Payment Requirement: 
						<span class="{data.globalSettings.paymentRequired === 1 ? 'text-red-400' : 'text-green-400'}">
							{data.globalSettings.paymentRequired === 1 ? 'REQUIRED' : 'NOT REQUIRED'}
						</span>
					</h4>
					<p class="text-sm text-gray-400 mb-4">
						{data.globalSettings.paymentRequired === 1 
							? 'Teams must pay to participate in matches'
							: 'Payment not enforced for match participation'}
					</p>
					<form 
						method="POST" 
						action="?/togglePayment"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
					>
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50 {
								data.globalSettings.paymentRequired === 1
									? 'bg-green-600 hover:bg-green-500 text-white'
									: 'bg-orange-600 hover:bg-orange-500 text-white'
							}"
						>
							{data.globalSettings.paymentRequired === 1 ? 'Disable Requirement' : 'Require Payment'}
						</button>
					</form>
				</div>
				
				<!-- League Fees -->
				<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
					<h4 class="text-lg font-bold text-white mb-3">
						League Fees: 
						<span class="text-gray-200">${data.globalSettings.leagueFees ?? 0}</span>
					</h4>
					<p class="text-sm text-gray-400 mb-4">
						Default registration fee amount
					</p>
					<form 
						method="POST" 
						action="?/updateFees"
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
							};
						}}
						class="flex gap-2"
					>
						<input
							type="number"
							name="fees"
							min="0"
							step="1"
							value={data.globalSettings.leagueFees ?? 0}
							required
							class="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
						/>
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
						>
							{isSubmitting ? 'Updating...' : 'Update'}
						</button>
					</form>
				</div>
			</div>
			
			<!-- Match Creation Deadline -->
			<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 mt-6">
				<h4 class="text-xl font-bold text-white mb-4">Match Creation Deadline</h4>
				<p class="text-sm text-gray-400 mb-4">
					Set the deadline for when the next week's matches should be created. This displays on the admin dashboard.
				</p>
				
				<form 
					method="POST" 
					action="?/updateMatchDeadline"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}
					class="space-y-4"
				>
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="weekNumber" class="block text-sm font-medium text-gray-300 mb-2">
								Week Number
							</label>
							<input
								type="number"
								id="weekNumber"
								name="weekNumber"
								min="1"
								value={data.globalSettings.currentMatchWeek ?? ''}
								placeholder="e.g. 3"
								class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
							/>
							<p class="text-xs text-gray-500 mt-1">The week number to create (shown on dashboard)</p>
						</div>
						
						<div>
							<label for="deadline" class="block text-sm font-medium text-gray-300 mb-2">
								Deadline Date & Time
							</label>
							<input
								type="datetime-local"
								id="deadline"
								name="deadline"
								value={data.globalSettings.matchCreationDeadline ? new Date(data.globalSettings.matchCreationDeadline).toISOString().slice(0, 16) : ''}
								class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
							/>
							<p class="text-xs text-gray-500 mt-1">When matches should be created by</p>
						</div>
					</div>
					
					<div class="flex items-center gap-4">
						<button
							type="submit"
							disabled={isSubmitting}
							class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
						>
							{isSubmitting ? 'Updating...' : 'Update Deadline'}
						</button>
						
						{#if data.globalSettings.matchCreationDeadline || data.globalSettings.currentMatchWeek}
							<span class="text-sm text-gray-400">
								Currently: Week {data.globalSettings.currentMatchWeek ?? '?'} 
								{#if data.globalSettings.matchCreationDeadline}
									due {new Date(data.globalSettings.matchCreationDeadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
								{/if}
							</span>
						{/if}
					</div>
				</form>
			</div>
			
			<!-- Season Assignments -->
			<div class="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 mt-6">
				<h4 class="text-xl font-bold text-white mb-4">Signup Season Assignments</h4>
				<p class="text-sm text-gray-400 mb-4">
					Assign which season new teams will be registered to for each region
				</p>
				<div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-6">
					<p class="text-amber-400 text-sm">
						<strong>⚠️ Warning:</strong> Changing season assignments affects which season new signups go to. 
						This effectively "ends" signups for the previous season in that region/format.
					</p>
				</div>
				
				{#if !hasAnyRegionsWithSeasons()}
					<div class="text-center py-8 text-gray-400">
						<p>No regions have seasons created yet.</p>
						<p class="text-sm mt-1">Create seasons in the League admin panel first.</p>
					</div>
				{:else}
					<!-- Format Tabs - only show formats that have regions with seasons -->
					<div class="flex border-b border-zinc-700 mb-6">
						{#each data.formats as format}
							{@const regionsForFormat = getRegionsWithSeasonsForFormat(format.id)}
							{#if regionsForFormat.length > 0}
								<button
									type="button"
									onclick={() => selectedFormatId = format.id}
									class="px-6 py-3 font-medium transition-colors relative {selectedFormatId === format.id 
										? 'text-orange-400 border-b-2 border-orange-400 -mb-px' 
										: 'text-gray-400 hover:text-gray-200'}"
								>
									{format.code}
									<span class="ml-1 text-xs text-gray-500">({regionsForFormat.length})</span>
								</button>
							{/if}
						{/each}
					</div>
					
					<form 
						method="POST" 
						action="?/updateSeasonAssignments"
						bind:this={seasonAssignmentForm}
						use:enhance={() => {
							isSubmitting = true;
							return async ({ update }) => {
								await update();
								isSubmitting = false;
								showSeasonAssignmentWarning = false;
							};
						}}
						class="space-y-4"
					>
						<!-- Hidden inputs for non-visible format tabs (to preserve their values) -->
						{#each data.formats as format}
							{#if format.id !== selectedFormatId}
								{#each getRegionsWithSeasonsForFormat(format.id) as region}
									{@const fieldName = `season_${region.id}_${format.id}`}
									{@const currentSeasonId = data.activeSeasonMap[`${region.id}-${format.id}`]}
									<input type="hidden" name="{fieldName}" value="{currentSeasonId || ''}" />
								{/each}
							{/if}
						{/each}
						
						<!-- Regions list for selected format -->
						{#if getRegionsWithSeasonsForFormat(selectedFormatId).length === 0}
							<div class="text-center py-8 text-gray-400">
								<p>No seasons created for this format yet.</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each getRegionsWithSeasonsForFormat(selectedFormatId) as region}
									{@const fieldName = `season_${region.id}_${selectedFormatId}`}
									{@const currentSeasonId = data.activeSeasonMap[`${region.id}-${selectedFormatId}`]}
									{@const regionSeasons = getSeasonsForRegionAndFormat(region.name, selectedFormatId)}
									
									<div class="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-lg">
										<div class="w-24 text-gray-200 font-medium">{region.name}</div>
										<div class="flex-1">
											<select
												id="{fieldName}"
												name="{fieldName}"
												class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
											>
												<option value="">No Season Selected</option>
												{#each regionSeasons as season}
													<option 
														value={season.id}
														selected={currentSeasonId === season.id}
													>
														Season {season.seasonNum} ({season._count.teams} teams, {season._count.matches} matches)
													</option>
												{/each}
											</select>
										</div>
										{#if currentSeasonId}
											<div class="text-green-400 text-sm">Active</div>
										{:else}
											<div class="text-gray-500 text-sm">Inactive</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
						
						<div class="pt-4 border-t border-zinc-700">
							<!-- This button shows the confirmation modal instead of submitting directly -->
							<button
								type="button"
								onclick={() => showSeasonAssignmentWarning = true}
								disabled={isSubmitting}
								class="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-md font-medium transition-colors disabled:opacity-50"
							>
								{isSubmitting ? 'Updating...' : 'Update Season Assignments'}
							</button>
						</div>
					</form>
				{/if}
			</div>
			
			<!-- Season Assignment Confirmation Modal -->
			{#if showSeasonAssignmentWarning}
				<div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick={() => showSeasonAssignmentWarning = false}>
					<div class="bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-md mx-4" onclick={(e) => e.stopPropagation()}>
						<h4 class="text-xl font-bold text-white mb-4">⚠️ Confirm Season Assignment Update</h4>
						<p class="text-gray-300 mb-4">
							Are you sure you want to update the season assignments?
						</p>
						<p class="text-amber-400 text-sm mb-6">
							This action will change which season new team signups are registered to. 
							Teams that haven't completed signup for the previous season will need to 
							re-register for the new season.
						</p>
						<div class="flex gap-3 justify-end">
							<button
								onclick={() => showSeasonAssignmentWarning = false}
								class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
							>
								Cancel
							</button>
							<button
								onclick={() => seasonAssignmentForm?.requestSubmit()}
								class="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
							>
								Yes, Update Assignments
							</button>
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<div class="text-center py-12 text-gray-500">
				<p class="text-gray-400">Global settings not initialized</p>
			</div>
		{/if}
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

