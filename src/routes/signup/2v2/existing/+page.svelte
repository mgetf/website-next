<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let selectedTeamId = $state<number | null>(null);
  let selectedRegionId = $state<number | null>(null);
  let divisionValue = $state('');

  let selectedTeam = $derived(data.ownedTeams.find((t) => t.id === selectedTeamId) || null);

  // Get the selected region object
  const selectedRegion = $derived(data.regions.find((r) => r.id === selectedRegionId));

  // Filter divisions based on selected region
  const filteredDivisions = $derived(
    selectedRegionId ? data.divisions.filter((d) => d.regionId === selectedRegionId) : [],
  );

  // Get currency symbol from selected region (default to $)
  const currencySymbol = $derived(selectedRegion?.currencySymbol ?? '$');

  // Options for FormSelect components
  const regionOptions = $derived(
    data.regions.map((r) => ({ value: r.id.toString(), label: r.name })),
  );

  const divisionOptions = $derived(
    filteredDivisions.map((d) => ({
      value: d.id.toString(),
      label:
        d.signupCost > 0
          ? `${d.name} - ${currencySymbol}${d.signupCost.toFixed(2)}`
          : `${d.name} - FREE`,
    })),
  );

  const isNewcomerSelected = $derived(
    filteredDivisions.some(
      (d) => d.id.toString() === divisionValue && d.name.toLowerCase().includes('newcomer'),
    ),
  );

  function handleRegionChange(value: string) {
    selectedRegionId = value ? parseInt(value) : null;
    const regionId = selectedRegionId;
    if (regionId) {
      const regionDivisions = data.divisions.filter((d) => d.regionId === regionId);
      divisionValue = regionDivisions.length > 0 ? regionDivisions[0].id.toString() : '';
    } else {
      divisionValue = '';
    }
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
      <h1 class="text-4xl font-bold text-white mb-2">Re-register Existing Team</h1>
      <p class="text-gray-400">Sign up one of your existing teams for the new season</p>
    </div>

    <!-- Error Message -->
    <FormError error={form?.error} />

    {#if data.previousSeasonNonOwnedTeams.length > 0}
      <div class="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <p class="text-yellow-400 text-sm font-semibold mb-1">
          Heads up: you will leave your previous team
        </p>
        <p class="text-yellow-300/80 text-sm">
          Completing this re-registration will automatically remove you from
          {#if data.previousSeasonNonOwnedTeams.length === 1}
            <a
              href="/teams/{data.previousSeasonNonOwnedTeams[0].id}"
              class="font-semibold underline hover:text-yellow-200"
              >{data.previousSeasonNonOwnedTeams[0].name}</a
            >,
          {:else}
            {#each data.previousSeasonNonOwnedTeams as team, i}
              <a href="/teams/{team.id}" class="font-semibold underline hover:text-yellow-200"
                >{team.name}</a
              >{i < data.previousSeasonNonOwnedTeams.length - 1 ? ', ' : ''}
            {/each},
          {/if}
          which {data.previousSeasonNonOwnedTeams.length === 1 ? 'is' : 'are'} from a previous season.
        </p>
      </div>
    {/if}

    {#if !data.canReregister}
      <!-- Unavailable Message -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
        <div class="text-6xl mb-4">🚫</div>
        <h2 class="text-2xl font-bold text-white mb-4">Team Re-registration Unavailable</h2>
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
        action="?/reregisterTeam"
        use:enhance={() => {
          isSubmitting = true;
          return async ({ update }) => {
            await update();
            isSubmitting = false;
          };
        }}
        class="bg-zinc-900 border border-zinc-800 rounded-lg p-8"
      >
        <!-- Team Selection -->
        <div class="mb-6">
          <div class="block text-sm font-medium text-gray-300 mb-3">
            Select Team <span class="text-red-500">*</span>
          </div>
          <div class="space-y-3">
            {#each data.ownedTeams as team}
              <label
                class="flex items-center gap-4 p-4 bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer hover:border-orange-500 transition-colors {selectedTeamId ===
                team.id
                  ? 'border-orange-500 bg-zinc-800/80'
                  : ''}"
              >
                <input
                  type="radio"
                  name="teamId"
                  value={team.id}
                  required
                  onchange={() => (selectedTeamId = team.id)}
                  class="w-4 h-4 text-orange-600 border-gray-600 bg-zinc-800 focus:ring-orange-500"
                />
                <div class="flex items-center gap-3 flex-1">
                  {#if team.avatar}
                    <img
                      src={team.avatar}
                      alt={team.name}
                      class="w-12 h-12 rounded-lg object-cover"
                    />
                  {:else}
                    <div class="w-12 h-12 rounded-lg bg-zinc-700 flex items-center justify-center">
                      <span class="text-xl text-gray-400">{team.name.charAt(0)}</span>
                    </div>
                  {/if}
                  <div>
                    <div class="font-semibold text-white">{team.name}</div>
                    <div class="text-sm text-gray-400">
                      {#if team.division}
                        {team.division.name}
                      {/if}
                      {#if team.region}
                        • {team.region.name}
                      {/if}
                      {#if team.season}
                        • Season {team.season.seasonNum}
                      {/if}
                    </div>
                  </div>
                </div>
              </label>
            {/each}
          </div>
        </div>

        <!-- Region & Division Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormSelect
            label="New Region"
            name="regionId"
            options={regionOptions}
            placeholder="Select Region"
            required
            onChange={handleRegionChange}
          />

          <FormSelect
            label="New Division"
            name="divisionId"
            bind:value={divisionValue}
            options={divisionOptions}
            placeholder={!selectedRegionId ? 'Select a region first' : 'Select Division'}
            required
            disabled={!selectedRegionId}
            hint={isNewcomerSelected
              ? 'Newcomer is ONLY for players with no previous competitive experience'
              : undefined}
            hintVariant={isNewcomerSelected ? 'warning' : 'default'}
          />
        </div>

        <!-- Terms & Conditions -->
        <div class="mb-6">
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
        </div>

        <!-- Info Box -->
        <div class="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p class="text-blue-400 text-sm">
            <strong>Note:</strong> Re-registering will reset your team's stats (wins, losses, points)
            and update the season, region, and division.
          </p>
        </div>

        <!-- Submit Button -->
        <div class="flex items-center gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            class="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? 'Re-registering...' : 'Re-register Team'}
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
