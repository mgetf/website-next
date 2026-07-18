<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import type { BracketMatch, BracketRound } from '$lib/types/bracket';
  import BracketRoundComponent from './BracketRound.svelte';

  interface Props {
    rounds: BracketRound[];
    label?: string;
  }

  let { rounds, label }: Props = $props();

  let feedInPaths = $state<FeedInPath[]>([]);
  let svgW = $state(0);
  let svgH = $state(0);

  interface FeedInTransition {
    roundIdx: number;
  }

  interface MatchEdge {
    edge: 'winner' | 'loser';
    targetMatchId: string;
  }

  interface FeedInPath extends MatchEdge {
    key: string;
    sourceMatchId: string;
    d: string;
  }

  const feedInTransitions = $derived(
    rounds.reduce<FeedInTransition[]>((acc, _round, i) => {
      if (i < rounds.length - 1 && rounds[i + 1].matches.length > rounds[i].matches.length) {
        acc.push({ roundIdx: i });
      }
      return acc;
    }, []),
  );

  function getEdgesToRound(match: BracketMatch, targetIds: Set<string>): MatchEdge[] {
    const edges: MatchEdge[] = [];
    const winnerTarget = match.winnerNextMatchId;
    const loserTarget = match.loserNextMatchId;

    if (winnerTarget !== undefined && targetIds.has(String(winnerTarget))) {
      edges.push({ edge: 'winner', targetMatchId: String(winnerTarget) });
    }
    if (loserTarget !== undefined && targetIds.has(String(loserTarget))) {
      edges.push({ edge: 'loser', targetMatchId: String(loserTarget) });
    }

    return edges;
  }

  function matchSlotsById(roundElement: Element): Map<string, HTMLElement> {
    return new Map(
      Array.from(roundElement.querySelectorAll<HTMLElement>('[data-match-id]')).map((element) => [
        element.dataset.matchId ?? '',
        element,
      ]),
    );
  }

  function measure(stageEl: HTMLDivElement) {
    const stageRect = stageEl.getBoundingClientRect();
    svgW = stageRect.width;
    svgH = stageRect.height;

    const roundElements = Array.from(stageEl.querySelectorAll<HTMLElement>('[data-round-number]'));
    const paths: FeedInPath[] = [];

    for (const transition of feedInTransitions) {
      const currentRound = rounds[transition.roundIdx];
      const nextRound = rounds[transition.roundIdx + 1];
      const currentRoundElement = roundElements.find(
        (element) => element.dataset.roundNumber === String(currentRound.number),
      );
      const nextRoundElement = roundElements.find(
        (element) => element.dataset.roundNumber === String(nextRound.number),
      );
      if (!currentRoundElement || !nextRoundElement) continue;

      const currentSlots = matchSlotsById(currentRoundElement);
      const nextSlots = matchSlotsById(nextRoundElement);
      const targetIds = new Set(nextRound.matches.map((match) => String(match.id)));

      for (const match of currentRound.matches) {
        const sourceMatchId = String(match.id);
        const sourceSlot = currentSlots.get(sourceMatchId);
        if (!sourceSlot) continue;

        for (const edge of getEdgesToRound(match, targetIds)) {
          const targetSlot = nextSlots.get(edge.targetMatchId);
          if (!targetSlot) continue;

          const sourceRect = sourceSlot.getBoundingClientRect();
          const targetRect = targetSlot.getBoundingClientRect();
          const sourceX = sourceRect.right - stageRect.left;
          const sourceY = sourceRect.top + sourceRect.height / 2 - stageRect.top;
          const targetX = targetRect.left - stageRect.left;
          const targetY = targetRect.top + targetRect.height / 2 - stageRect.top;
          const midpointX = sourceX + (targetX - sourceX) / 2;

          paths.push({
            ...edge,
            sourceMatchId,
            key: `${sourceMatchId}-${edge.edge}-${edge.targetMatchId}`,
            d: `M ${sourceX} ${sourceY} H ${midpointX} V ${targetY} H ${targetX}`,
          });
        }
      }
    }

    feedInPaths = paths;
  }

  const measureStage: Attachment<HTMLDivElement> = (stageEl) => {
    if (feedInTransitions.length === 0) return;

    measure(stageEl);

    const observer = new ResizeObserver(() => measure(stageEl));
    observer.observe(stageEl);

    return () => {
      observer.disconnect();
    };
  };
</script>

<div class="flex flex-col">
  {#if label}
    <div class="text-sm font-semibold text-text-label mb-3">{label}</div>
  {/if}

  <div class="bracket-stage" {@attach measureStage}>
    {#each rounds as round, i (round.number)}
      {@const nextCount = i < rounds.length - 1 ? rounds[i + 1].matches.length : 0}
      {@const prevCount = i > 0 ? rounds[i - 1].matches.length : 0}
      {@const isFeedInSource = nextCount > round.matches.length}
      {@const isFeedInTarget = prevCount > 0 && prevCount < round.matches.length}
      {@const noMerge = nextCount > 0 && nextCount >= round.matches.length && !isFeedInSource}
      <div class="shrink-0 flex" class:bracket-gap={i > 0} data-round-number={round.number}>
        <BracketRoundComponent
          {round}
          isFirstRound={i === 0}
          isLastRound={i === rounds.length - 1}
          straightOutgoing={noMerge}
          suppressOutgoing={isFeedInSource}
          suppressIncoming={isFeedInTarget}
        />
      </div>
    {/each}

    {#if feedInPaths.length > 0}
      <svg
        class="feed-in-overlay"
        width={svgW}
        height={svgH}
        viewBox="0 0 {svgW} {svgH}"
        aria-hidden="true"
      >
        {#each feedInPaths as path (path.key)}
          <path
            d={path.d}
            data-source-match-id={path.sourceMatchId}
            data-target-match-id={path.targetMatchId}
            data-edge={path.edge}
            stroke="var(--bracket-connector-color, var(--color-border-input))"
            stroke-width="2"
            fill="none"
          />
        {/each}
      </svg>
    {/if}
  </div>
</div>

<style>
  :global(:root) {
    --bracket-match-width: 12rem;
    --bracket-round-gap: 2.5rem;
    --bracket-connector-color: var(--color-border-input);
    --bracket-connector-width: 2px;
    --bracket-match-pad-x: 0.5rem;
    --bracket-match-pad-y: 0.375rem;
    --bracket-meta-pad-y: 0.25rem;
    --bracket-font-size: 0.8125rem;
    --bracket-slot-pad: 0.1875rem;
    --bracket-stage-gap: 2rem;
  }

  .bracket-stage {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .bracket-gap {
    margin-left: var(--bracket-round-gap);
  }

  .feed-in-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }
</style>
