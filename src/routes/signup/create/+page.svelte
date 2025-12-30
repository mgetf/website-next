<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let isSubmitting = $state(false);
	let avatarFile: File | null = $state(null);
	let avatarPreview: string | null = $state(null);
	let selectedRegionId = $state<number | null>(null);

	// Get the selected region object
	const selectedRegion = $derived(
		data.regions.find(r => r.id === selectedRegionId)
	);

	// Filter divisions based on selected region
	const filteredDivisions = $derived(
		selectedRegionId
			? data.divisions.filter(d => d.regionId === selectedRegionId)
			: []
	);

	// Get currency symbol from selected region (default to $)
	const currencySymbol = $derived(selectedRegion?.currencySymbol ?? '$');

	function handleAvatarChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (file) {
			avatarFile = file;
			const reader = new FileReader();
			reader.onload = (e) => {
				avatarPreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function handleRegionChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		selectedRegionId = target.value ? parseInt(target.value) : null;
	}
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
	<div class="max-w-3xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<a
				href="/signup"
				class="inline-flex items-center text-gray-400 hover:text-white mb-4 transition-colors"
			>
				← Back to Signup Options
			</a>
			<h1 class="text-4xl font-bold text-white mb-2">Create New Team</h1>
			<p class="text-gray-400">Fill out the form below to register your team for the season</p>
		</div>

		<!-- Error Message -->
		{#if form?.error}
			<div class="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
				<p class="text-red-400">{form.error}</p>
			</div>
		{/if}

		{#if !data.canCreate}
			<!-- Unavailable Message -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">🚫</div>
				<h2 class="text-2xl font-bold text-white mb-4">Team Creation Unavailable</h2>
				<p class="text-gray-400 text-lg mb-6">
					{data.disabledReason}
				</p>
				<a
					href="/signup"
					class="inline-block px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg transition-colors"
				>
					← Back to Signup Options
				</a>
			</div>
		{:else}
		<!-- Form -->
		<form
			method="POST"
			action="?/createTeam"
			enctype="multipart/form-data"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ update }) => {
					await update();
					isSubmitting = false;
				};
			}}
			class="bg-zinc-900 border border-zinc-800 rounded-lg p-8"
		>
			<!-- Team Name -->
			<div class="mb-6">
				<label for="name" class="block text-sm font-medium text-gray-300 mb-2">
					Team Name <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					id="name"
					name="name"
					required
					maxlength="25"
					placeholder="Enter team name (max 25 characters)"
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
				/>
				<p class="text-xs text-gray-500 mt-1">No &lt; or &gt; characters allowed</p>
			</div>

			<!-- Acronym -->
			<div class="mb-6">
				<label for="acronym" class="block text-sm font-medium text-gray-300 mb-2">
					Team Acronym <span class="text-gray-500">(optional)</span>
				</label>
				<input
					type="text"
					id="acronym"
					name="acronym"
					maxlength="4"
					placeholder="e.g., MGE (max 4 characters)"
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
				/>
			</div>

			<!-- Avatar Upload -->
			<div class="mb-6">
				<label for="avatar" class="block text-sm font-medium text-gray-300 mb-2">
					Team Avatar <span class="text-gray-500">(optional)</span>
				</label>
				<div class="flex items-center gap-4">
					{#if avatarPreview}
						<img
							src={avatarPreview}
							alt="Avatar preview"
							class="w-20 h-20 rounded-lg object-cover border border-zinc-700"
						/>
					{:else}
						<div
							class="w-20 h-20 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
						>
							<span class="text-gray-500 text-2xl">?</span>
						</div>
					{/if}
					<label
						for="avatar"
						class="cursor-pointer px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-gray-300 hover:bg-zinc-700 transition-colors"
					>
						Choose File
					</label>
					<input
						type="file"
						id="avatar"
						name="avatar"
						accept="image/jpeg,image/png,image/gif,image/webp"
						onchange={handleAvatarChange}
						class="hidden"
					/>
				</div>
				<p class="text-xs text-gray-500 mt-2">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
			</div>

			<!-- Region & Division Grid -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
				<!-- Region (First - controls division options) -->
				<div>
					<label for="regionId" class="block text-sm font-medium text-gray-300 mb-2">
						Region <span class="text-red-500">*</span>
					</label>
					<select
						id="regionId"
						name="regionId"
						required
						onchange={handleRegionChange}
						class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 transition-colors"
					>
						<option value="">Select Region</option>
						{#each data.regions as region}
							<option value={region.id}>
								{region.name}
							</option>
						{/each}
					</select>
				</div>

				<!-- Division (Filtered by selected region) -->
				<div>
					<label for="divisionId" class="block text-sm font-medium text-gray-300 mb-2">
						Division <span class="text-red-500">*</span>
					</label>
					<select
						id="divisionId"
						name="divisionId"
						required
						disabled={!selectedRegionId}
						class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if !selectedRegionId}
							<option value="">Select a region first</option>
						{:else}
							<option value="">Select Division</option>
							{#each filteredDivisions as division}
								<option value={division.id}>
									{division.name}
									{#if division.signupCost > 0}
										- {currencySymbol}{division.signupCost.toFixed(2)}
									{:else}
										- FREE
									{/if}
								</option>
							{/each}
						{/if}
					</select>
				</div>
			</div>

			<!-- Join Password -->
			<div class="mb-6">
				<label for="joinPassword" class="block text-sm font-medium text-gray-300 mb-2">
					Team Join Password <span class="text-red-500">*</span>
				</label>
				<input
					type="text"
					id="joinPassword"
					name="joinPassword"
					required
					placeholder="Create a password for players to join your team"
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
				/>
				<p class="text-xs text-gray-500 mt-1">
					Players will need this password to request joining your team
				</p>
			</div>

			<!-- Terms & Conditions -->
			<div class="mb-6 space-y-3">
				<label class="flex items-start gap-3 cursor-pointer">
					<input
						type="checkbox"
						name="terms"
						required
						class="mt-1 w-4 h-4 rounded border-gray-600 bg-zinc-800 text-orange-600 focus:ring-orange-500 focus:ring-offset-zinc-900"
					/>
					<span class="text-sm text-gray-300">
						I have read and agree to the
						<a href="/rulebook" target="_blank" class="text-orange-500 hover:text-orange-400">
							Terms and Conditions
						</a>
					</span>
				</label>

				<label class="flex items-start gap-3 cursor-pointer">
					<input
						type="checkbox"
						name="rules"
						required
						class="mt-1 w-4 h-4 rounded border-gray-600 bg-zinc-800 text-orange-600 focus:ring-orange-500 focus:ring-offset-zinc-900"
					/>
					<span class="text-sm text-gray-300">
						I agree to follow the
						<a href="/rulebook" target="_blank" class="text-orange-500 hover:text-orange-400">
							League Rules
						</a>
					</span>
				</label>
			</div>

			<!-- Submit Button -->
			<div class="flex items-center gap-4">
				<button
					type="submit"
					disabled={isSubmitting}
					class="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
				>
					{isSubmitting ? 'Creating Team...' : 'Create Team'}
				</button>
				<a
					href="/signup"
					class="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors"
				>
					Cancel
				</a>
			</div>
		</form>
		{/if}
	</div>
</div>


