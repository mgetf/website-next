<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData } from './$types';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { data }: { data: PageData } = $props();

  let isSubmitting = $state(false);

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'UNPLAYED':
        return 'Not Played';
      case 'PLAYED':
        return 'Played';
      case 'DISPUTE':
        return 'Disputed';
      default:
        return status;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'UNPLAYED':
        return 'bg-gray-500';
      case 'PLAYED':
        return 'bg-success-500';
      case 'DISPUTE':
        return 'bg-danger-500';
      default:
        return 'bg-gray-500';
    }
  }
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <!-- Page Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Disputed Matches</h2>
    <p class="text-text-body">Review and resolve match disputes</p>
  </div>

  <!-- Disputed Matches List -->
  <div class="space-y-4">
    {#if data.disputedMatches.length === 0}
      <Card padding="none" class="p-12 text-center">
        <div class="text-6xl mb-4">✅</div>
        <h3 class="text-xl font-bold text-white mb-2">No Disputed Matches</h3>
        <p class="text-text-body">All matches have been resolved</p>
      </Card>
    {:else}
      {#each data.disputedMatches as match}
        <Card padding="lg">
          <div class="flex items-start justify-between mb-4">
            <div class="flex-1">
              <!-- Match Info -->
              <div class="flex items-center gap-3 mb-2">
                <h3 class="text-lg font-bold text-white">
                  Match #{match.id}
                </h3>
                <span
                  class="px-2 py-1 text-xs font-medium rounded {getStatusColor(
                    match.status,
                  )} text-white"
                >
                  {getStatusLabel(match.status)}
                </span>
              </div>

              <!-- Teams -->
              <div class="flex items-center gap-3 mb-2">
                <a
                  href="/teams/{match.homeTeam.id}"
                  class="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                >
                  {match.homeTeam.name}
                </a>
                <span class="text-text-muted">vs</span>
                <a
                  href="/teams/{match.awayTeam.id}"
                  class="text-primary-400 hover:text-primary-300 font-medium transition-colors"
                >
                  {match.awayTeam.name}
                </a>
              </div>

              <!-- Season & Result Info -->
              <div class="flex items-center gap-3 text-sm text-text-body">
                <span>
                  {match.season.region.name} - Season {match.season.seasonNum}
                  {#if match.weekNo}, Week {match.weekNo}{/if}
                </span>
                {#if match.winner}
                  <span>•</span>
                  <span class="text-text-label">
                    Winner: {match.winner.name} ({match.winnerScore}-{match.loserScore})
                  </span>
                {/if}
              </div>
            </div>

            <!-- View Match Button -->
            <Button variant="primary" href="/matches/{match.id}">View Details</Button>
          </div>

          <!-- Resolution Form -->
          <form
            method="POST"
            action="?/resolveDispute"
            use:enhance={() => {
              isSubmitting = true;
              return async ({ update }) => {
                await update();
                isSubmitting = false;
              };
            }}
            class="border-t border-border-default pt-4 space-y-3"
          >
            <input type="hidden" name="matchId" value={match.id} />

            <FormSelect
              label="Resolve Dispute"
              name="status"
              value="PLAYED"
              required
              options={[
                { value: 'PLAYED', label: 'Mark as Played (Accept Result)' },
                { value: 'UNPLAYED', label: 'Mark as Unplayed (Reset Match)' },
              ]}
            />

            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Resolving...' : 'Resolve'}
            </Button>
          </form>
        </Card>
      {/each}
    {/if}
  </div>
</div>
