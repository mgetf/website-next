<script lang="ts">
  import type { EliminationBracketData } from '#lib/types/bracket.js';
  import {
    BRACKET_CARD_HEIGHT,
    BRACKET_CARD_WIDTH,
    layoutEliminationBracket,
  } from '#lib/utils/bracketLayout.js';
  import MatchCard from './MatchCard.svelte';
  import { useBracketHover } from './bracket-hover.svelte';

  interface Props {
    data: EliminationBracketData;
  }

  let { data }: Props = $props();

  const MIN_SCALE = 0.35;
  const MAX_SCALE = 1.6;
  const PAD = 16;

  const layout = $derived(layoutEliminationBracket(data));
  const hover = useBracketHover();

  let viewport = $state<HTMLDivElement | null>(null);
  let viewportWidth = $state(0);
  let scale = $state(1);
  let userZoomed = $state(false);

  const contentWidth = $derived(layout.width + PAD * 2);
  const contentHeight = $derived(layout.height + PAD * 2);

  /** Fit the width, but not so small the names stop being readable. */
  function fitScale(): number {
    if (viewportWidth <= 0 || contentWidth <= 0) return 1;
    return Math.min(1, Math.max(0.6, viewportWidth / contentWidth));
  }

  $effect(() => {
    // Follow the container until the viewer picks a zoom of their own.
    if (!userZoomed) scale = fitScale();
  });

  function zoomTo(next: number, anchor?: { x: number; y: number }) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (viewport && anchor) {
      const ratio = clamped / scale;
      const left = (viewport.scrollLeft + anchor.x) * ratio - anchor.x;
      const top = (viewport.scrollTop + anchor.y) * ratio - anchor.y;
      scale = clamped;
      userZoomed = true;
      requestAnimationFrame(() => {
        if (!viewport) return;
        viewport.scrollLeft = left;
        viewport.scrollTop = top;
      });
      return;
    }
    scale = clamped;
    userZoomed = true;
  }

  function fit() {
    userZoomed = false;
    scale = fitScale();
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  function onWheel(event: WheelEvent) {
    // Plain scrolling keeps scrolling the page; ctrl or cmd zooms.
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = viewport?.getBoundingClientRect();
    if (!rect) return;
    zoomTo(scale * Math.exp(-event.deltaY * 0.002), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }

  // Drag to pan, and pinch to zoom on touch screens.
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  let pinchStart: { distance: number; scale: number } | null = null;

  function distance(): number {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event: PointerEvent) {
    if (!viewport || event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinchStart = { distance: distance(), scale };
      drag = null;
      return;
    }
    drag = {
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      moved: false,
    };
  }

  function onPointerMove(event: PointerEvent) {
    if (!viewport) return;
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pointers.size === 2 && pinchStart) {
      const rect = viewport.getBoundingClientRect();
      const [a, b] = [...pointers.values()];
      zoomTo(pinchStart.scale * (distance() / pinchStart.distance), {
        x: (a.x + b.x) / 2 - rect.left,
        y: (a.y + b.y) / 2 - rect.top,
      });
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    viewport.scrollLeft = drag.left - dx;
    viewport.scrollTop = drag.top - dy;
  }

  function onPointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (pointers.size === 0) {
      // Let the click that ends a drag be swallowed, then forget it.
      setTimeout(() => (drag = null), 0);
    }
  }

  function onClickCapture(event: MouseEvent) {
    if (!drag?.moved) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** The lines a hovered team has travelled: matches it won lead on to the next. */
  const travelled = $derived.by(() => {
    const label = hover.label;
    const keys = new Set<string>();
    if (label === null) return keys;
    const winnerOf = new Map<string, string | undefined>();
    for (const node of layout.nodes) {
      const { side1, side2 } = node.match;
      winnerOf.set(
        node.id,
        side1.isWinner ? side1.label : side2.isWinner ? side2.label : undefined,
      );
    }
    for (const edge of layout.edges) {
      if (winnerOf.get(edge.from) === label) keys.add(edge.key);
    }
    return keys;
  });
</script>

<div class="bracket-canvas">
  {#if data.title}
    <h3 class="mb-3 text-lg font-bold text-text-heading">{data.title}</h3>
  {/if}

  <div class="bracket-toolbar" role="group" aria-label="Bracket zoom">
    <button type="button" aria-label="Zoom out" onclick={() => zoomTo(scale / 1.2)}>−</button>
    <button type="button" class="bracket-zoom-readout" aria-label="Fit to width" onclick={fit}>
      {Math.round(scale * 100)}%
    </button>
    <button type="button" aria-label="Zoom in" onclick={() => zoomTo(scale * 1.2)}>+</button>
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="bracket-viewport"
    bind:this={viewport}
    bind:clientWidth={viewportWidth}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onclickcapture={onClickCapture}
  >
    <div
      class="bracket-sizer"
      style:width="{contentWidth * scale}px"
      style:height="{contentHeight * scale}px"
    >
      <div
        class="bracket-stage"
        style:width="{contentWidth}px"
        style:height="{contentHeight}px"
        style:transform="scale({scale})"
      >
        <div class="bracket-origin" style:left="{PAD}px" style:top="{PAD}px">
          {#each layout.sectionLabels as section (section.key)}
            <div class="bracket-section-label" style:top="{section.y}px">{section.label}</div>
          {/each}

          {#each layout.headers as header (header.key)}
            <div
              class="bracket-round-label"
              style:left="{header.x}px"
              style:top="{header.y}px"
              style:width="{BRACKET_CARD_WIDTH}px"
            >
              {header.label}
            </div>
          {/each}

          <svg
            class="bracket-lines"
            width={layout.width}
            height={layout.height}
            viewBox="0 0 {layout.width} {layout.height}"
            aria-hidden="true"
          >
            {#each layout.edges as edge (edge.key)}
              <path
                d={edge.d}
                class:bracket-line-hot={travelled.has(edge.key)}
                data-source-match-id={edge.from}
                data-target-match-id={edge.to}
              />
            {/each}
          </svg>

          {#each layout.nodes as node (node.id)}
            <div
              class="bracket-node"
              data-match-id={node.id}
              style:left="{node.x}px"
              style:top="{node.y}px"
              style:width="{BRACKET_CARD_WIDTH}px"
              style:height="{BRACKET_CARD_HEIGHT}px"
            >
              <MatchCard match={node.match} />
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .bracket-canvas {
    position: relative;
    /* Compact cards: the grid assumes a fixed card height. */
    --bracket-match-pad-y: 0.1875rem;
    --bracket-match-pad-x: 0.5rem;
    --bracket-meta-pad-y: 0.125rem;
    --bracket-font-size: 0.8125rem;
  }

  .bracket-toolbar {
    position: absolute;
    top: 0.25rem;
    right: 0.5rem;
    z-index: 10;
    display: flex;
    overflow: hidden;
    border: 1px solid var(--color-border-default);
    border-radius: 0.5rem;
    background: var(--color-surface-card);
    font-size: 0.8125rem;
  }

  .bracket-toolbar button {
    min-width: 2rem;
    padding: 0.25rem 0.5rem;
    color: var(--color-text-label);
    line-height: 1.25rem;
  }

  .bracket-toolbar button:hover {
    background: var(--color-surface-input);
    color: var(--color-text-heading);
  }

  .bracket-zoom-readout {
    min-width: 3.25rem;
    font-variant-numeric: tabular-nums;
    border-inline: 1px solid var(--color-border-default);
  }

  .bracket-viewport {
    max-height: min(78vh, 60rem);
    overflow: auto;
    cursor: grab;
    touch-action: pan-x pan-y;
    overscroll-behavior: contain;
  }

  .bracket-viewport:active {
    cursor: grabbing;
  }

  .bracket-sizer {
    position: relative;
  }

  .bracket-stage {
    position: relative;
    transform-origin: 0 0;
  }

  .bracket-origin {
    position: absolute;
  }

  .bracket-node {
    position: absolute;
    display: flex;
    align-items: center;
    user-select: none;
  }

  .bracket-node :global(.match-card-wrapper) {
    width: 100%;
  }

  .bracket-round-label {
    position: absolute;
    padding-bottom: 0.5rem;
    text-align: center;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 30px;
  }

  .bracket-section-label {
    position: absolute;
    left: 0;
    white-space: nowrap;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--color-text-label);
  }

  .bracket-lines {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
    pointer-events: none;
  }

  .bracket-lines path {
    fill: none;
    stroke: var(--bracket-connector-color, var(--color-border-input));
    stroke-width: 2;
    transition: stroke 0.12s ease;
  }

  .bracket-lines path.bracket-line-hot {
    stroke: var(--color-primary-500, #3b82f6);
    stroke-width: 2.5;
  }
</style>
