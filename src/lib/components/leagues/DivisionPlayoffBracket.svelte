<script lang="ts">
  import type { BracketData } from '#lib/types/bracket.js';
  import type { LeaguePlayoffPlacement } from '#lib/types/league.js';
  import Badge from '#lib/components/ui/Badge.svelte';
  import BracketRenderer from '#lib/components/brackets/BracketRenderer.svelte';
  import MatchCard from '#lib/components/brackets/MatchCard.svelte';

  let {
    bracket,
    placements = [],
    isIndividual = false,
  }: {
    bracket: BracketData;
    placements?: LeaguePlayoffPlacement[];
    isIndividual?: boolean;
  } = $props();

  const formatLabel = $derived(
    bracket.format === 'double_elim'
      ? 'Double Elim'
      : bracket.format === 'single_elim'
        ? 'Single Elim'
        : null,
  );

  const statusBadge = $derived(
    bracket.status === 'completed'
      ? { label: 'Completed', color: 'green' as const }
      : bracket.status === 'in_progress'
        ? { label: 'In Progress', color: 'yellow' as const }
        : { label: 'Upcoming', color: 'zinc' as const },
  );

  const roundList = $derived(bracket.format === 'card' ? bracket.rounds : []);

  function placeText(place: number): string {
    if (place === 1) return '1st';
    if (place === 2) return '2nd';
    if (place === 3) return '3rd';
    return `#${place}`;
  }
</script>

<div class="league-playoff-bracket min-w-0">
  <div
    class="bg-surface-card/80 backdrop-blur border border-border-default rounded-lg overflow-hidden"
  >
    <div
      class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-border-default bg-surface-card/80"
    >
      <h3 class="text-sm font-semibold text-text-label">Playoffs</h3>
      <div class="flex flex-wrap items-center gap-2">
        <Badge color={isIndividual ? 'purple' : 'blue'}>{isIndividual ? '1v1' : '2v2'}</Badge>
        {#if formatLabel}
          <Badge color="zinc">{formatLabel}</Badge>
        {/if}
        <Badge color={statusBadge.color}>{statusBadge.label}</Badge>
      </div>
    </div>
    {#if placements.length > 0}
      <ol class="flex flex-wrap gap-x-4 gap-y-1 border-b border-border-default px-4 py-2 text-sm">
        {#each placements as placement (placement.place)}
          <li>
            <span class="text-text-muted">{placeText(placement.place)}</span>
            <a href={placement.href} class="ml-1 text-text-heading hover:text-primary-ink">
              {placement.label}
            </a>
          </li>
        {/each}
      </ol>
    {/if}
    <div class="min-w-0 overflow-x-auto p-3">
      {#if bracket.format === 'card'}
        <div class="flex gap-4">
          {#each roundList as round (round.number)}
            <div class="shrink-0 space-y-2" style:width="var(--bracket-match-width)">
              <div
                class="text-center text-xs font-semibold tracking-wider text-text-muted uppercase"
              >
                {round.label}
              </div>
              {#each round.matches as match (`${match.id}:${match.position}`)}
                <MatchCard {match} />
              {/each}
            </div>
          {/each}
        </div>
      {:else}
        <BracketRenderer data={bracket} />
      {/if}
    </div>
  </div>
</div>

<style>
  .league-playoff-bracket {
    --bracket-match-width: 9.5rem;
    --bracket-round-gap: 1.25rem;
    --bracket-stage-gap: 1.25rem;
    --bracket-font-size: 0.75rem;
    --bracket-match-pad-x: 0.375rem;
    --bracket-match-pad-y: 0.25rem;
  }

  .league-playoff-bracket :global(.bracket-scroll-container) {
    padding-right: 1.5rem;
  }
</style>
