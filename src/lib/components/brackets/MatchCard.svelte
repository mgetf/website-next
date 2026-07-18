<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { BracketMatch } from '$lib/types/bracket';
  import Badge from '$lib/components/ui/Badge.svelte';
  import MatchSide from './MatchSide.svelte';

  interface Props {
    match: BracketMatch;
  }

  let { match }: Props = $props();

  const isLive = $derived(match.status === 'live');
  const showMetaRow = $derived(match.bestOf !== undefined || match.label !== undefined || isLive);

  const isSide1Bye = $derived(
    match.isBye && match.side1.label === 'BYE' && !match.side1.players?.length,
  );
  const isSide2Bye = $derived(
    match.isBye && match.side2.label === 'BYE' && !match.side2.players?.length,
  );

  const hasGames = $derived(
    !match.isBye &&
      match.status === 'completed' &&
      match.games !== undefined &&
      match.games.length > 0,
  );
  const gameDetailsId = $derived(
    `match-game-details-${String(match.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
  );
  const matchLabel = $derived(`${match.side1.label} vs ${match.side2.label}`);
  const allowPlayerLinks = $derived(!match.href && !hasGames);

  let hoverIntent = $state(false);
  let showPopover = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let touchShouldReveal = false;

  function clearHoverTimer() {
    if (hoverTimer !== undefined) {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
  }

  function onCardEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    if (!hasGames) return;
    hoverIntent = true;
    clearHoverTimer();
    hoverTimer = setTimeout(() => {
      if (hoverIntent) showPopover = true;
    }, 200);
  }

  function onCardLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    hoverIntent = false;
    clearHoverTimer();
    if (
      event.currentTarget instanceof HTMLElement &&
      event.currentTarget === document.activeElement
    )
      return;
    showPopover = false;
  }

  function onCardFocus() {
    if (!hasGames) return;
    clearHoverTimer();
    showPopover = true;
  }

  function onCardBlur() {
    showPopover = false;
  }

  function onCardKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !showPopover) return;
    event.preventDefault();
    showPopover = false;
  }

  function onCardPointerDown(event: PointerEvent) {
    touchShouldReveal = event.pointerType === 'touch' && hasGames && !showPopover;
  }

  function onMatchLinkClick(event: MouseEvent) {
    if (!touchShouldReveal) return;
    event.preventDefault();
    showPopover = true;
    touchShouldReveal = false;
  }

  function onDetailsClick() {
    if (touchShouldReveal) {
      showPopover = true;
      touchShouldReveal = false;
      return;
    }
    showPopover = !showPopover;
  }

  onDestroy(clearHoverTimer);

  const containerClasses = $derived(
    [
      'block w-full text-left bg-surface-card border rounded-lg overflow-hidden transition-colors',
      isLive ? 'border-primary-500' : 'border-border-default',
      match.isBye ? 'opacity-60' : '',
      match.href || hasGames ? 'hover:border-border-input cursor-pointer' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#snippet cardContent()}
  {#if showMetaRow}
    <div
      class="bracket-meta-row flex items-center gap-2 border-b border-border-default bg-surface-input/40"
    >
      {#if match.bestOf !== undefined}
        <Badge color="zinc" size="sm">Bo{match.bestOf}</Badge>
      {/if}

      {#if match.label}
        <span class="bracket-meta-text flex-1 truncate font-medium text-text-muted">
          {match.label}
        </span>
      {:else}
        <span class="flex-1"></span>
      {/if}

      {#if isLive}
        <span
          class="bracket-meta-text flex shrink-0 items-center gap-1 font-medium text-primary-400"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-400"></span>
          LIVE
        </span>
      {/if}
    </div>
  {/if}

  <MatchSide
    side={match.side1}
    matchStatus={match.status}
    isByeSide={isSide1Bye}
    {allowPlayerLinks}
  />
  <div class="border-t border-border-default"></div>
  <MatchSide
    side={match.side2}
    matchStatus={match.status}
    isByeSide={isSide2Bye}
    {allowPlayerLinks}
  />
{/snippet}

<div class="match-card-wrapper">
  {#if match.href}
    <a
      href={match.href}
      class={containerClasses}
      aria-label="View match: {matchLabel}"
      aria-controls={hasGames ? gameDetailsId : undefined}
      aria-expanded={hasGames ? showPopover : undefined}
      aria-describedby={hasGames && showPopover ? gameDetailsId : undefined}
      onpointerenter={onCardEnter}
      onpointerleave={onCardLeave}
      onpointerdown={onCardPointerDown}
      onfocus={onCardFocus}
      onblur={onCardBlur}
      onkeydown={onCardKeydown}
      onclick={onMatchLinkClick}
    >
      {@render cardContent()}
    </a>
  {:else if hasGames}
    <button
      type="button"
      class={containerClasses}
      aria-label="Show game details for {matchLabel}"
      aria-controls={gameDetailsId}
      aria-expanded={showPopover}
      aria-describedby={showPopover ? gameDetailsId : undefined}
      onpointerenter={onCardEnter}
      onpointerleave={onCardLeave}
      onpointerdown={onCardPointerDown}
      onblur={onCardBlur}
      onkeydown={onCardKeydown}
      onclick={onDetailsClick}
    >
      {@render cardContent()}
    </button>
  {:else}
    <div class={containerClasses}>
      {@render cardContent()}
    </div>
  {/if}

  {#if hasGames && match.games}
    <div
      id={gameDetailsId}
      class="game-popover"
      class:game-popover-visible={showPopover}
      role="tooltip"
      aria-hidden={!showPopover}
    >
      <div class="mb-1.5 flex items-center gap-3 font-medium text-text-muted">
        <span class="flex-1 truncate text-right">{match.side1.label}</span>
        <span class="w-6"></span>
        <span class="flex-1 truncate">{match.side2.label}</span>
      </div>
      {#each match.games as game (game.gameNumber)}
        {@const s1Wins = game.side1Score > game.side2Score}
        {@const s2Wins = game.side2Score > game.side1Score}
        <div class="game-row">
          <span
            class="flex-1 text-right tabular-nums {s1Wins
              ? 'font-semibold text-success-400'
              : 'text-text-muted'}"
          >
            {game.side1Score}
          </span>
          <span class="game-num">G{game.gameNumber}</span>
          <span
            class="flex-1 tabular-nums {s2Wins
              ? 'font-semibold text-success-400'
              : 'text-text-muted'}"
          >
            {game.side2Score}
          </span>
        </div>
        {#if game.arena}
          <div class="text-center text-text-muted" style="font-size: 0.6rem; margin-top: -1px;">
            {game.arena}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .match-card-wrapper {
    position: relative;
  }

  .game-popover {
    position: absolute;
    left: 100%;
    top: 50%;
    transform: translateY(-50%);
    margin-left: 0.5rem;
    z-index: 30;
    background: var(--color-surface-card);
    border: 1px solid var(--color-border-input);
    border-radius: 0.5rem;
    padding: 0.5rem 0.625rem;
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);
    white-space: nowrap;
    font-size: calc(var(--bracket-font-size, 0.8125rem) * 0.8);
    min-width: 8rem;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 0.12s ease,
      visibility 0.12s ease;
  }

  .game-popover-visible {
    visibility: visible;
    opacity: 1;
  }

  .game-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0;
  }

  .game-num {
    width: 1.5rem;
    text-align: center;
    color: var(--color-text-muted);
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  :global(.bracket-meta-row) {
    padding: var(--bracket-meta-pad-y, 0.25rem) var(--bracket-match-pad-x, 0.5rem);
  }
  :global(.bracket-meta-text) {
    font-size: calc(var(--bracket-font-size, 0.8125rem) * 0.8);
  }
</style>
