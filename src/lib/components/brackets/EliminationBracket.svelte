<script lang="ts">
  import type { Attachment } from 'svelte/attachments';
  import type { BracketRound, EliminationBracketData } from '$lib/types/bracket';
  import BracketStage from './BracketStage.svelte';
  import MatchCard from './MatchCard.svelte';

  interface Props {
    data: EliminationBracketData;
  }

  interface GrandFinalFeed {
    sourceMatchId: string;
    targetMatchId: string;
    edge: 'winner' | 'loser';
  }

  interface ConnectorPath extends GrandFinalFeed {
    key: string;
    d: string;
  }

  let { data }: Props = $props();

  const isDoubleElim = $derived(data.format === 'double_elim');

  let connectorPaths = $state<ConnectorPath[]>([]);
  let svgW = $state(0);
  let svgH = $state(0);

  function findGrandFinalFeed(
    rounds: BracketRound[],
    targetIds: Set<string>,
  ): GrandFinalFeed | undefined {
    for (let roundIndex = rounds.length - 1; roundIndex >= 0; roundIndex -= 1) {
      const matches = rounds[roundIndex].matches;
      for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
        const match = matches[matchIndex];
        const winnerTarget = match.winnerNextMatchId;
        if (winnerTarget !== undefined && targetIds.has(String(winnerTarget))) {
          return {
            sourceMatchId: String(match.id),
            targetMatchId: String(winnerTarget),
            edge: 'winner',
          };
        }

        const loserTarget = match.loserNextMatchId;
        if (loserTarget !== undefined && targetIds.has(String(loserTarget))) {
          return {
            sourceMatchId: String(match.id),
            targetMatchId: String(loserTarget),
            edge: 'loser',
          };
        }
      }
    }

    return undefined;
  }

  function findMatchSlot(root: Element, matchId: string): HTMLElement | undefined {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-match-id]')).find(
      (element) => element.dataset.matchId === matchId,
    );
  }

  function measure(wrapperEl: HTMLDivElement) {
    if (!data.grandFinal) return;
    const wrapperRect = wrapperEl.getBoundingClientRect();
    svgW = wrapperRect.width;
    svgH = wrapperRect.height;

    const winnersStage = wrapperEl.querySelector('[data-stage="winners"]');
    const losersStage = wrapperEl.querySelector('[data-stage="losers"]');
    const gfStage = wrapperEl.querySelector('[data-stage="grand-final"]');

    if (!winnersStage || !losersStage || !gfStage) return;

    const grandFinalIds = new Set(data.grandFinal.matches.map((match) => String(match.id)));
    const feeds = [
      {
        root: winnersStage,
        feed: findGrandFinalFeed(data.rounds, grandFinalIds),
      },
      {
        root: losersStage,
        feed: findGrandFinalFeed(data.loserRounds ?? [], grandFinalIds),
      },
    ];

    const measuredFeeds = feeds.flatMap(({ root, feed }) => {
      if (!feed) return [];

      const sourceSlot = findMatchSlot(root, feed.sourceMatchId);
      const targetSlot = findMatchSlot(gfStage, feed.targetMatchId);
      if (!sourceSlot || !targetSlot) return [];

      return [
        {
          ...feed,
          sourceRect: sourceSlot.getBoundingClientRect(),
          targetRect: targetSlot.getBoundingClientRect(),
        },
      ];
    });

    const furthestSourceX = Math.max(
      ...measuredFeeds.map(({ sourceRect }) => sourceRect.right - wrapperRect.left),
    );

    connectorPaths = measuredFeeds.map(({ sourceRect, targetRect, ...feed }) => {
      const sourceX = sourceRect.right - wrapperRect.left;
      const sourceY = sourceRect.top + sourceRect.height / 2 - wrapperRect.top;
      const targetX = targetRect.left - wrapperRect.left;
      const targetY = targetRect.top + targetRect.height / 2 - wrapperRect.top;
      const midpointX = furthestSourceX + (targetX - furthestSourceX) / 2;

      return {
        ...feed,
        key: `${feed.sourceMatchId}-${feed.edge}-${feed.targetMatchId}`,
        d: `M ${sourceX} ${sourceY} H ${midpointX} V ${targetY} H ${targetX}`,
      };
    });
  }

  const measureBracket: Attachment<HTMLDivElement> = (wrapperEl) => {
    if (!isDoubleElim || !data.grandFinal) return;

    measure(wrapperEl);

    const observer = new ResizeObserver(() => measure(wrapperEl));
    observer.observe(wrapperEl);

    return () => {
      observer.disconnect();
    };
  };
</script>

<div class="bracket-scroll-container">
  {#if data.title}
    <h3 class="text-lg font-bold text-text-heading mb-4">{data.title}</h3>
  {/if}

  {#if isDoubleElim}
    <div class="double-elim-wrapper" {@attach measureBracket}>
      <div class="brackets-column">
        <div data-stage="winners">
          <BracketStage rounds={data.rounds} label="Winners Bracket" />
        </div>

        {#if data.loserRounds && data.loserRounds.length > 0}
          <div data-stage="losers">
            <BracketStage rounds={data.loserRounds} label="Losers Bracket" />
          </div>
        {/if}
      </div>

      {#if data.grandFinal && data.grandFinal.matches.length > 0}
        <div data-stage="grand-final" class="gf-column">
          <div
            class="text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 text-center"
            style:width="var(--bracket-match-width, 12rem)"
          >
            Grand Final
          </div>
          <div class="flex flex-col gap-3">
            {#each data.grandFinal.matches as match (match.id)}
              <div
                class="match-slot"
                data-match-id={String(match.id)}
                style:width="var(--bracket-match-width, 12rem)"
              >
                <MatchCard {match} />
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if connectorPaths.length > 0}
        <svg
          class="connector-overlay"
          width={svgW}
          height={svgH}
          viewBox="0 0 {svgW} {svgH}"
          aria-hidden="true"
        >
          {#each connectorPaths as path (path.key)}
            <path
              d={path.d}
              data-source-match-id={path.sourceMatchId}
              data-target-match-id={path.targetMatchId}
              data-edge={path.edge}
              stroke="var(--color-border-input)"
              stroke-width="2"
              fill="none"
            />
          {/each}
        </svg>
      {/if}
    </div>
  {:else}
    <BracketStage rounds={data.rounds} />
  {/if}
</div>

<style>
  .double-elim-wrapper {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .brackets-column {
    display: flex;
    flex-direction: column;
    gap: var(--bracket-stage-gap, 2rem);
  }

  .gf-column {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-left: var(--bracket-round-gap, 2.5rem);
  }

  .connector-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: visible;
  }

  .bracket-scroll-container {
    overflow-x: auto;
    padding-bottom: 0.5rem;
    padding-right: 10rem;
    -webkit-overflow-scrolling: touch;
  }

  .bracket-scroll-container::-webkit-scrollbar {
    height: 6px;
  }

  .bracket-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .bracket-scroll-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-border-default) 60%, transparent);
    border-radius: 3px;
  }

  .bracket-scroll-container::-webkit-scrollbar-thumb:hover {
    background: var(--color-border-input);
  }
</style>
