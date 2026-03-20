<script lang="ts">
  import type { BracketData } from '$lib/types/bracket';
  import BracketStage from './BracketStage.svelte';
  import MatchCard from './MatchCard.svelte';

  interface Props {
    data: BracketData;
  }

  let { data }: Props = $props();

  const isDoubleElim = $derived(data.format === 'double_elim');

  let wrapperEl: HTMLDivElement | undefined = $state();
  let wfToGfPath = $state('');
  let lfToGfPath = $state('');
  let svgW = $state(0);
  let svgH = $state(0);

  function measure() {
    if (!wrapperEl) return;

    const wrapperRect = wrapperEl.getBoundingClientRect();
    svgW = wrapperRect.width;
    svgH = wrapperRect.height;

    const winnersStage = wrapperEl.querySelector('[data-stage="winners"]');
    const losersStage = wrapperEl.querySelector('[data-stage="losers"]');
    const gfStage = wrapperEl.querySelector('[data-stage="grand-final"]');

    if (!winnersStage || !losersStage || !gfStage) return;

    const wfSlots = winnersStage.querySelectorAll('.match-slot');
    const lfSlots = losersStage.querySelectorAll('.match-slot');
    const gfSlot = gfStage.querySelector('.match-slot');

    if (!wfSlots.length || !lfSlots.length || !gfSlot) return;

    const wfCard = wfSlots[wfSlots.length - 1];
    const lfCard = lfSlots[lfSlots.length - 1];

    const wfRect = wfCard.getBoundingClientRect();
    const lfRect = lfCard.getBoundingClientRect();
    const gfRect = gfSlot.getBoundingClientRect();

    const wfRightX = wfRect.right - wrapperRect.left;
    const wfCenterY = wfRect.top + wfRect.height / 2 - wrapperRect.top;

    const lfRightX = lfRect.right - wrapperRect.left;
    const lfCenterY = lfRect.top + lfRect.height / 2 - wrapperRect.top;

    const gfLeftX = gfRect.left - wrapperRect.left;
    const gfCenterY = gfRect.top + gfRect.height / 2 - wrapperRect.top;

    const midX = Math.max(wfRightX, lfRightX) + (gfLeftX - Math.max(wfRightX, lfRightX)) / 2;

    wfToGfPath = `M ${wfRightX} ${wfCenterY} H ${midX} V ${gfCenterY} H ${gfLeftX}`;
    lfToGfPath = `M ${lfRightX} ${lfCenterY} H ${midX} V ${gfCenterY} H ${gfLeftX}`;
  }

  $effect(() => {
    if (!wrapperEl || !isDoubleElim || !data.grandFinal) return;

    measure();

    const observer = new ResizeObserver(() => measure());
    observer.observe(wrapperEl);

    return () => observer.disconnect();
  });
</script>

<div class="bracket-scroll-container">
  {#if data.title}
    <h3 class="text-lg font-bold text-text-heading mb-4">{data.title}</h3>
  {/if}

  {#if isDoubleElim}
    <div class="double-elim-wrapper" bind:this={wrapperEl}>
      <div class="brackets-column">
        <div data-stage="winners">
          <BracketStage rounds={data.rounds} label="Winners Bracket" />
        </div>

        {#if data.loserRounds && data.loserRounds.length > 0}
          <div data-stage="losers">
            <BracketStage rounds={data.loserRounds} label="Losers Bracket" isLosersBracket />
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
              <div class="match-slot" style:width="var(--bracket-match-width, 12rem)">
                <MatchCard {match} />
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if data.grandFinal && (wfToGfPath || lfToGfPath)}
        <svg class="connector-overlay" width={svgW} height={svgH} viewBox="0 0 {svgW} {svgH}">
          {#if wfToGfPath}
            <path d={wfToGfPath} stroke="var(--color-border-input)" stroke-width="2" fill="none" />
          {/if}
          {#if lfToGfPath}
            <path d={lfToGfPath} stroke="var(--color-border-input)" stroke-width="2" fill="none" />
          {/if}
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
