<script lang="ts">
  import type { BracketRound } from '$lib/types/bracket';
  import Card from '$lib/components/ui/Card.svelte';
  import MatchCard from './MatchCard.svelte';

  interface Props {
    rounds: BracketRound[];
  }

  let { rounds }: Props = $props();

  const matchCount = $derived(rounds.reduce((total, round) => total + round.matches.length, 0));
</script>

{#if matchCount === 0}
  <Card>
    <p class="py-4 text-center text-sm text-text-body">No matches have been scheduled.</p>
  </Card>
{:else}
  <div class="space-y-6">
    {#each rounds as round (round.number)}
      {#if round.matches.length > 0}
        <section>
          <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
            {round.label}
          </h4>
          <div class="grid gap-3 md:grid-cols-2">
            {#each round.matches as match (match.id)}
              <MatchCard {match} />
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>
{/if}
