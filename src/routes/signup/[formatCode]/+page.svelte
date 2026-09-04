<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import SignupLoginGate from '$lib/components/signup/SignupLoginGate.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let selectedRegionId = $state<number | null>(null);
  let divisionValue = $state('');

  const themeClasses = $derived(getFormatThemeClasses(data.format.themeKey));

  // Get the selected region object
  const selectedRegion = $derived(
    data.regions.find((r: (typeof data.regions)[number]) => r.id === selectedRegionId),
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
    data.regions.map((r: (typeof data.regions)[number]) => ({
      value: r.id.toString(),
      label: r.name,
    })),
  );

  const divisionOptions = $derived(
    filteredDivisions.map((d: (typeof filteredDivisions)[number]) => ({
      value: d.id.toString(),
      label:
        d.signupCost > 0
          ? `${d.name} - ${currencySymbol}${d.signupCost.toFixed(2)}`
          : `${d.name} - FREE`,
    })),
  );

  const isNewcomerSelected = $derived(
    filteredDivisions.some(
      (d: (typeof filteredDivisions)[number]) =>
        d.id.toString() === divisionValue && d.name.toLowerCase().includes('newcomer'),
    ),
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
        class="inline-flex items-center text-text-body hover:text-white mb-4 transition-colors"
      >
        ← Back to Signup Options
      </a>
      <h1 class="text-4xl font-bold text-white mb-2">{data.format.name} League Signup</h1>
      <p class="text-text-body">
        Sign up as an individual player for the {data.format.name} league
      </p>
    </div>

    <!-- Error Message -->
    <FormError error={form?.error} />

    {#if data.needsLogin}
      <SignupLoginGate />
    {:else if !data.canSignup}
      <!-- Unavailable Message -->
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">🚫</div>
        <h2 class="text-2xl font-bold text-white mb-4">{data.format.name} Signup Unavailable</h2>
        <p class="text-text-body text-lg mb-6">
          {data.disabledReason}
        </p>
        <Button href="/signup" variant="secondary" size="lg">← Back to Signup Options</Button>
      </Card>
    {:else}
      {#if data.user}
        <Card class="mb-6">
          <h3 class="text-sm font-medium text-text-body mb-3">Signing Up As</h3>
          <div class="flex items-center gap-4">
            {#if data.user.steamAvatar}
              <img
                src={data.user.steamAvatar}
                alt="Your avatar"
                class="w-16 h-16 rounded-lg border border-border-input"
              />
            {:else}
              <div
                class="w-16 h-16 rounded-lg bg-surface-input border border-border-input flex items-center justify-center"
              >
                <span class="text-text-muted text-2xl">?</span>
              </div>
            {/if}
            <div>
              <p class="text-xl font-bold text-white">{data.user.steamUsername}</p>
              <p class="text-sm text-text-muted">
                Your name and avatar will be frozen for this season
              </p>
            </div>
          </div>
        </Card>
      {/if}

      <!-- Form -->
      <Card padding="lg">
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
        >
          <!-- Region -->
          <FormSelect
            label="Region"
            name="regionId"
            value={selectedRegionId?.toString() ?? ''}
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
            hint={isNewcomerSelected
              ? 'Newcomer is ONLY for players with no previous competitive experience!'
              : undefined}
            hintVariant={isNewcomerSelected ? 'warning' : 'default'}
          />

          <!-- Info Box -->
          <div
            class="mb-6 p-4 {themeClasses.bg500_10} border {themeClasses.border500_30} rounded-lg"
          >
            <h4 class="{themeClasses.text400} font-medium mb-2">
              How {data.format.name} League Works
            </h4>
            <ul class="text-sm text-text-body space-y-1">
              <li>• You sign up as an individual player, not a team</li>
              <li>• Your Steam name and avatar are frozen at signup time</li>
              <li>• Matches are played 1v1 against other players</li>
              <li>• Same match infrastructure as team formats (scheduling, map bans, demos)</li>
            </ul>
          </div>

          <!-- Terms & Conditions -->
          <div class="mb-6">
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="rules"
                required
                class="mt-1 w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500 focus:ring-offset-zinc-900"
              />
              <span class="text-sm text-text-label">
                I agree to follow the
                <a href="/rulebook" target="_blank" class="text-primary-500 hover:text-primary-400">
                  League Rules
                </a>
              </span>
            </label>
          </div>

          <!-- Submit Button -->
          <div class="flex items-center gap-4">
            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Signing Up...' : `Sign Up for ${data.format.name} League`}
            </Button>
            <Button href="/signup" variant="secondary" size="lg">Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}
  </div>
</div>
