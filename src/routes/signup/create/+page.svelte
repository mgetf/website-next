<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';
import FormInput from '$lib/components/ui/form/FormInput.svelte';
import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
import FormError from '$lib/components/ui/form/FormError.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
let avatarFile: File | null = $state(null);
let avatarPreview: string | null = $state(null);
let selectedRegionId = $state<number | null>(null);

// Get the selected region object
const selectedRegion = $derived(
  data.regions.find((r) => r.id === selectedRegionId),
);

// Filter divisions based on selected region
const filteredDivisions = $derived(
  selectedRegionId
    ? data.divisions.filter((d) => d.regionId === selectedRegionId)
    : [],
);

// Get currency symbol from selected region (default to $)
const currencySymbol = $derived(selectedRegion?.currencySymbol ?? '$');

// Options for FormSelect components
const regionOptions = $derived(
  data.regions.map((r) => ({ value: r.id.toString(), label: r.name }))
);

const divisionOptions = $derived(
  filteredDivisions.map((d) => ({
    value: d.id.toString(),
    label: d.signupCost > 0
      ? `${d.name} - ${currencySymbol}${d.signupCost.toFixed(2)}`
      : `${d.name} - FREE`
  }))
);

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

function handleRegionChange(value: string) {
  selectedRegionId = value ? parseInt(value) : null;
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
		<FormError error={form?.error} />

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
			<FormInput
				label="Team Name"
				name="name"
				required
				maxlength={25}
				placeholder="Enter team name (max 25 characters)"
				hint="No < or > characters allowed"
			/>

			<!-- Acronym -->
			<FormInput
				label="Team Acronym"
				name="acronym"
				maxlength={4}
				placeholder="e.g., MGE (max 4 characters)"
			/>

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
			<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<FormSelect
					label="Region"
					name="regionId"
					options={regionOptions}
					placeholder="Select Region"
					required
					onChange={handleRegionChange}
				/>

				<FormSelect
					label="Division"
					name="divisionId"
					options={divisionOptions}
					placeholder={!selectedRegionId ? 'Select a region first' : 'Select Division'}
					required
					disabled={!selectedRegionId}
				/>
			</div>

			<!-- Join Password -->
			<FormInput
				label="Team Join Password"
				name="joinPassword"
				required
				placeholder="Create a password for players to join your team"
				hint="Players will need this password to request joining your team"
			/>

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


