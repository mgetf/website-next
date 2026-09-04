<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import SignupLoginGate from '$lib/components/signup/SignupLoginGate.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let avatarFile: File | null = $state(null);
  let avatarPreview: string | null = $state(null);
  let selectedRegionId = $state<number | null>(null);
  let divisionValue = $state('');
  let teamName = $state('');
  let acronym = $state('');

  const themeClasses = $derived(getFormatThemeClasses(data.format.themeKey));

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
        class="inline-flex items-center text-text-body hover:text-white mb-4 transition-colors"
      >
        ← Back to Signup Options
      </a>
      <h1 class="text-4xl font-bold text-white mb-2">Create New {data.format.name} Team</h1>
      <p class="text-text-body">Fill out the form below to register your team for the season</p>
    </div>

    <!-- Error Message -->
    <FormError error={form?.error} />

    {#if data.previousSeasonTeams.length > 0}
      <div class="mb-6 p-4 bg-warning-500/10 border border-warning-500/30 rounded-lg">
        <p class="text-warning-400 text-sm font-semibold mb-1">
          Heads up: you will leave your previous team
        </p>
        <p class="text-warning-300/80 text-sm">
          Creating this team will automatically remove you from
          {#if data.previousSeasonTeams.length === 1}
            <a
              href="/teams/{data.previousSeasonTeams[0].id}"
              class="font-semibold underline hover:text-warning-200"
              >{data.previousSeasonTeams[0].name}</a
            >,
          {:else}
            {#each data.previousSeasonTeams as team, i}
              <a href="/teams/{team.id}" class="font-semibold underline hover:text-warning-200"
                >{team.name}</a
              >{i < data.previousSeasonTeams.length - 1 ? ', ' : ''}
            {/each},
          {/if}
          which {data.previousSeasonTeams.length === 1 ? 'is' : 'are'} from a previous season.
        </p>
      </div>
    {/if}

    {#if data.needsLogin}
      <SignupLoginGate />
    {:else if !data.canCreate}
      <!-- Unavailable Message -->
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">🚫</div>
        <h2 class="text-2xl font-bold text-white mb-4">Team Creation Unavailable</h2>
        <p class="text-text-body text-lg mb-6">
          {data.disabledReason}
        </p>
        <Button href="/signup" variant="secondary" size="lg">← Back to Signup Options</Button>
      </Card>
    {:else}
      <!-- Form -->
      <Card padding="lg">
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
        >
          <!-- Team Name -->
          <FormInput
            label="Team Name"
            name="name"
            bind:value={teamName}
            required
            maxlength={25}
            placeholder="Enter team name (max 25 characters)"
            hint="No < or > characters allowed"
          />

          <!-- Acronym (only if format supports it) -->
          {#if data.format.supportsAcronym}
            <FormInput
              label="Team Acronym"
              name="acronym"
              bind:value={acronym}
              maxlength={4}
              placeholder="e.g., MGE (max 4 characters)"
            />
          {/if}

          <!-- Avatar Upload -->
          <div class="mb-6">
            <label for="avatar" class="block text-sm font-medium text-text-label mb-2">
              Team Avatar <span class="text-text-muted">(optional)</span>
            </label>
            <div class="flex items-center gap-4">
              {#if avatarPreview}
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  class="w-20 h-20 rounded-lg object-cover border border-border-input"
                />
              {:else}
                <div
                  class="w-20 h-20 rounded-lg bg-surface-input border border-border-input flex items-center justify-center"
                >
                  <span class="text-text-muted text-2xl">?</span>
                </div>
              {/if}
              <label
                for="avatar"
                class="cursor-pointer px-4 py-2 bg-surface-input border border-border-input rounded-lg text-text-label hover:bg-surface-hover transition-colors"
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
            <p class="text-xs text-text-muted mt-2">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
          </div>

          <!-- Region & Division Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormSelect
              label="Region"
              name="regionId"
              value={selectedRegionId?.toString() ?? ''}
              options={regionOptions}
              placeholder="Select Region"
              required
              onChange={handleRegionChange}
            />

            <FormSelect
              label="Division"
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

          <!-- Join Password -->
          <FormInput
            label="Team Join Password"
            name="joinPassword"
            required
            placeholder="Create a password for players to join your team"
            hint="Players will need this password to request joining your team"
          />

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
              {isSubmitting ? 'Creating Team...' : `Create ${data.format.name} Team`}
            </Button>
            <Button href="/signup" variant="secondary" size="lg">Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}
  </div>
</div>
