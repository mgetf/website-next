<script lang="ts">
import type { PageData, ActionData } from './$types';
import { enhance } from '$app/forms';

let { data, form }: { data: PageData; form: ActionData } = $props();

let isSubmitting = $state(false);
let selectedRegionId = $state<number | null>(null);

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

function handleRegionChange(event: Event) {
  const target = event.target as HTMLSelectElement;
  selectedRegionId = target.value ? parseInt(target.value) : null;
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
		{#if form?.error}
			<div class="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
				<p class="text-red-400">{form.error}</p>
			</div>
		{/if}

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
				<div class="mb-6">
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

				<!-- Division -->
				<div class="mb-6">
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
