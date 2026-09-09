<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import SignupLoginGate from '$lib/components/signup/SignupLoginGate.svelte';
  import SignupPicks from '$lib/components/signup/SignupPicks.svelte';
  import { getFormatThemeClasses } from '$lib/constants/formats';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let isSubmitting = $state(false);
  let selectedTeamId = $state<number | null>(null);

  const themeClasses = $derived(getFormatThemeClasses(data.format.themeKey));
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
      <h1 class="text-4xl font-bold text-white mb-2">
        Re-register Existing {data.format.name} Team
      </h1>
      <p class="text-text-body">
        Re-register an existing team. Pick a format, region, and division for the new season.
      </p>
    </div>

    <!-- Error Message -->
    <FormError error={form?.error} />

    {#if data.previousSeasonNonOwnedTeams.length > 0}
      <div class="mb-6 p-4 bg-warning-500/10 border border-warning-500/30 rounded-lg">
        <p class="text-warning-400 text-sm font-semibold mb-1">
          Heads up: you will leave your previous team
        </p>
        <p class="text-warning-300/80 text-sm">
          Completing this re-registration will automatically remove you from
          {#if data.previousSeasonNonOwnedTeams.length === 1}
            <a
              href="/teams/{data.previousSeasonNonOwnedTeams[0].id}"
              class="font-semibold underline hover:text-warning-200"
              >{data.previousSeasonNonOwnedTeams[0].name}</a
            >,
          {:else}
            {#each data.previousSeasonNonOwnedTeams as team, i}
              <a href="/teams/{team.id}" class="font-semibold underline hover:text-warning-200"
                >{team.name}</a
              >{i < data.previousSeasonNonOwnedTeams.length - 1 ? ', ' : ''}
            {/each},
          {/if}
          which {data.previousSeasonNonOwnedTeams.length === 1 ? 'is' : 'are'} from a previous season.
        </p>
      </div>
    {/if}

    {#if data.needsLogin}
      <SignupLoginGate />
    {:else if !data.canReregister}
      <!-- Unavailable Message -->
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">🚫</div>
        <h2 class="text-2xl font-bold text-white mb-4">
          {data.format.name} Team Re-registration Unavailable
        </h2>
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
          action="?/reregisterTeam"
          use:enhance={() => {
            isSubmitting = true;
            return async ({ update }) => {
              await update();
              isSubmitting = false;
            };
          }}
        >
          <!-- Team Selection -->
          <div class="mb-6">
            <div class="block text-sm font-medium text-text-label mb-3">
              Select Team <span class="text-danger-500">*</span>
            </div>
            <div class="space-y-3">
              {#each data.ownedTeams as team}
                <label
                  class="flex items-center gap-4 p-4 bg-surface-input border border-border-input rounded-lg cursor-pointer {themeClasses.hoverBorder500} transition-colors {selectedTeamId ===
                  team.id
                    ? `border-primary-500 ${themeClasses.bg500_10}`
                    : ''}"
                >
                  <input
                    type="radio"
                    name="teamId"
                    value={team.id}
                    checked={selectedTeamId === team.id}
                    required
                    onchange={() => (selectedTeamId = team.id)}
                    class="w-4 h-4 text-primary-600 border-border-input bg-surface-input focus:ring-primary-500"
                  />
                  <div class="flex items-center gap-3 flex-1">
                    {#if team.avatar}
                      <img
                        src={team.avatar}
                        alt={team.name}
                        class="w-12 h-12 rounded-lg object-cover"
                      />
                    {:else}
                      <div
                        class="w-12 h-12 rounded-lg bg-surface-hover flex items-center justify-center"
                      >
                        <span class="text-xl text-text-body">{team.name.charAt(0)}</span>
                      </div>
                    {/if}
                    <div>
                      <div class="font-semibold text-white">{team.name}</div>
                      <div class="text-sm text-text-body">
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

          <SignupPicks
            formats={data.formats}
            regions={data.regions}
            divisions={data.divisions}
            currentFormatId={data.format.id}
            fee={data.fee}
            teamMode="existing"
            regionLabel="New Region"
          />

          <!-- Terms & Conditions -->
          <div class="mb-6">
            <label class="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="terms"
                required
                class="mt-1 w-4 h-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
              />
              <span class="text-sm text-text-label">
                I have read and agree to the
                <a href="/rulebook" target="_blank" class="text-primary-500 hover:text-primary-400">
                  Terms and Conditions
                </a>
              </span>
            </label>
          </div>

          <!-- Info Box -->
          <div
            class="mb-6 p-4 {themeClasses.bg500_10} border {themeClasses.border500_30} rounded-lg"
          >
            <p class="{themeClasses.text400} text-sm">
              <strong>Note:</strong> Re-registering will reset your team's stats (wins, losses, points)
              and update the season, region, and division.
            </p>
          </div>

          <!-- Submit Button -->
          <div class="flex items-center gap-4">
            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? 'Re-registering...' : `Re-register ${data.format.name} Team`}
            </Button>
            <Button href="/signup" variant="secondary" size="lg">Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}
  </div>
</div>
