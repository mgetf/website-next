<script lang="ts">
  import type { BracketData } from '$lib/types/bracket';
  import Badge from '$lib/components/ui/Badge.svelte';
  import BracketRenderer from '$lib/components/brackets/BracketRenderer.svelte';

  let {
    bracket,
    isIndividual = false,
  }: {
    bracket: BracketData;
    isIndividual?: boolean;
  } = $props();

  const formatLabel = $derived(
    bracket.format === 'double_elim'
      ? 'Double Elim'
      : bracket.format === 'single_elim'
        ? 'Single Elim'
        : bracket.format === 'round_robin'
          ? 'Round Robin'
          : 'Fight Card',
  );

  const statusBadge = $derived(
    bracket.status === 'completed'
      ? { label: 'Completed', color: 'green' as const }
      : bracket.status === 'in_progress'
        ? { label: 'In Progress', color: 'yellow' as const }
        : { label: 'Upcoming', color: 'zinc' as const },
  );
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
        <Badge color="zinc">{formatLabel}</Badge>
        <Badge color={statusBadge.color}>{statusBadge.label}</Badge>
      </div>
    </div>
    <div class="min-w-0 overflow-x-auto p-3">
      <BracketRenderer data={bracket} />
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
