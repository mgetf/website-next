<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';
import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
import FormError from '$lib/components/ui/form/FormError.svelte';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
let selectedRegionId = $state<number | null>(null);
let divisionValue = $state('');

// Get the selected region object
const selectedRegion = $derived(
  data.regions.find(
    (r: (typeof data.regions)[number]) => r.id === selectedRegionId,
  ),
);

// Filter divisions based on selected region
const filteredDivisions = $derived(
  selectedRegionId
    ? data.divisions.filter(
        (d: (typeof data.divisions)[number]) => d.regionId === selectedRegionId,
      )
    : [],
);

// Get currency symbol from selected region (default to $)
const currencySymbol = $derived(selectedRegion?.currencySymbol ?? '$');

// Options for FormSelect components
const regionOptions = $derived(
  data.regions.map((r: (typeof data.regions)[number]) => ({ value: r.id.toString(), label: r.name }))
);

const divisionOptions = $derived(
  filteredDivisions.map((d: (typeof filteredDivisions)[number]) => ({
    value: d.id.toString(),
    label: d.signupCost > 0
      ? `${d.name} - ${currencySymbol}${d.signupCost.toFixed(2)}`
      : `${d.name} - FREE`
  }))
);

const isNewcomerSelected = $derived(
  filteredDivisions.some((d: (typeof filteredDivisions)[number]) => d.id.toString() === divisionValue && d.name.toLowerCase().includes('newcomer'))
);

function handleRegionChange(value: string) {
  selectedRegionId = value ? parseInt(value) : null;
  const regionId = selectedRegionId;
  if (regionId) {
    const regionDivisions = data.divisions.filter(
      (d: (typeof data.divisions)[number]) => d.regionId === regionId,
    );
    divisionValue = regionDivisions.length > 0 ? regionDivisions[0].id.toString() : '';
  } else {
    divisionValue = '';
  }
}
</script>

<div class="min-h-[calc(100vh-4rem)] px-4 py-12">
	<div class="max-w-2xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<a
				href="/signup"
				class="inline-flex items-center text-gray-400 hover:text-white mb-4 transition-colors"
			>
				&larr; Back to Signup Options
			</a>
			<h1 class="text-4xl font-bold text-white mb-2">1v1 League Signup</h1>
			<p class="text-gray-400">Sign up as an individual player for the 1v1 league</p>
		</div>

		<!-- Error Message -->
		<FormError error={form?.error} />

		{#if !data.canSignup}
			<!-- Unavailable Message -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
				<div class="text-6xl mb-4">&#128683;</div>
				<h2 class="text-2xl font-bold text-white mb-4">1v1 Signup Unavailable</h2>
				<p class="text-gray-400 text-lg mb-6">
					{data.disabledReason}
				</p>
				<a
					href="/signup"
					class="inline-block px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg transition-colors"
				>
					&larr; Back to Signup Options
				</a>
			</div>
		{:else}
			<!-- User Info Card -->
			<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6">
				<h3 class="text-sm font-medium text-gray-400 mb-3">Signing Up As</h3>
				<div class="flex items-center gap-4">
					{#if data.user?.steamAvatar}
						<img
							src={data.user.steamAvatar}
							alt="Your avatar"
							class="w-16 h-16 rounded-lg border border-zinc-700"
						/>
					{:else}
						<div
							class="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center"
						>
							<span class="text-gray-500 text-2xl">?</span>
						</div>
					{/if}
					<div>
						<p class="text-xl font-bold text-white">{data.user?.steamUsername}</p>
						<p class="text-sm text-gray-500">
							Your name and avatar will be frozen for this season
						</p>
					</div>
				</div>
			</div>

			<!-- Form -->
			<form
				method="POST"
				action="?/signup"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
					};
				}}
				class="bg-zinc-900 border border-zinc-800 rounded-lg p-8"
			>
				<!-- Region -->
				<FormSelect
					label="Region"
					name="regionId"
					options={regionOptions}
					placeholder="Select Region"
					required
					onChange={handleRegionChange}
				/>

				<!-- Division -->
		<FormSelect
			label="Division"
			name="divisionId"
			bind:value={divisionValue}
			options={divisionOptions}
			placeholder={!selectedRegionId ? 'Select a region first' : 'Select Division'}
			required
			disabled={!selectedRegionId}
			hint={isNewcomerSelected ? 'Newcomer is ONLY for players with no previous competitive experience!' : undefined}
			hintVariant={isNewcomerSelected ? 'warning' : 'default'}
		/>

				<!-- Info Box -->
				<div class="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
					<h4 class="text-blue-400 font-medium mb-2">How 1v1 League Works</h4>
					<ul class="text-sm text-gray-400 space-y-1">
						<li>&#8226; You sign up as an individual player, not a team</li>
						<li>&#8226; Your Steam name and avatar are frozen at signup time</li>
						<li>&#8226; Matches are played 1v1 against other players</li>
						<li>&#8226; Same match infrastructure as 2v2 (scheduling, map bans, demos)</li>
					</ul>
				</div>

				<!-- Terms & Conditions -->
				<div class="mb-6">
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
						{isSubmitting ? 'Signing Up...' : 'Sign Up for 1v1 League'}
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
