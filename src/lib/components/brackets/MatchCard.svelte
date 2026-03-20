<script lang="ts">
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
    !match.isBye && match.status === 'completed' && match.games && match.games.length > 0,
  );

  let hoverIntent = $state(false);
  let showPopover = $state(false);
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  function onCardEnter() {
    if (!hasGames) return;
    hoverIntent = true;
    hoverTimer = setTimeout(() => {
      if (hoverIntent) showPopover = true;
    }, 200);
  }

  function onCardLeave() {
    hoverIntent = false;
    clearTimeout(hoverTimer);
    showPopover = false;
  }

  const containerClasses = $derived(
    [
      'bg-surface-card border rounded-lg overflow-hidden transition-colors',
      isLive ? 'border-primary-500' : 'border-border-default',
      match.isBye ? 'opacity-60' : '',
      match.href ? 'hover:border-border-input cursor-pointer' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="match-card-wrapper" onmouseenter={onCardEnter} onmouseleave={onCardLeave}>
  {#if match.href}
    <a href={match.href} class={containerClasses}>
      {#if showMetaRow}
        <div
          class="bracket-meta-row flex items-center gap-2 border-b border-border-default bg-surface-input/40"
        >
          {#if match.bestOf !== undefined}
            <Badge color="zinc" size="sm">Bo{match.bestOf}</Badge>
          {/if}

          {#if match.label}
            <span class="bracket-meta-text text-text-muted font-medium truncate flex-1"
              >{match.label}</span
            >
          {:else}
            <span class="flex-1"></span>
          {/if}

          {#if isLive}
            <span
              class="flex items-center gap-1 text-primary-400 bracket-meta-text font-medium shrink-0"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
              LIVE
            </span>
          {/if}
        </div>
      {/if}

      <MatchSide side={match.side1} matchStatus={match.status} isByeSide={isSide1Bye} />
      <div class="border-t border-border-default"></div>
      <MatchSide side={match.side2} matchStatus={match.status} isByeSide={isSide2Bye} />
    </a>
  {:else}
    <div class={containerClasses}>
      {#if showMetaRow}
        <div
          class="bracket-meta-row flex items-center gap-2 border-b border-border-default bg-surface-input/40"
        >
          {#if match.bestOf !== undefined}
            <Badge color="zinc" size="sm">Bo{match.bestOf}</Badge>
          {/if}

          {#if match.label}
            <span class="bracket-meta-text text-text-muted font-medium truncate flex-1"
              >{match.label}</span
            >
          {:else}
            <span class="flex-1"></span>
          {/if}

          {#if isLive}
            <span
              class="flex items-center gap-1 text-primary-400 bracket-meta-text font-medium shrink-0"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
              LIVE
            </span>
          {/if}
        </div>
      {/if}

      <MatchSide side={match.side1} matchStatus={match.status} isByeSide={isSide1Bye} />
      <div class="border-t border-border-default"></div>
      <MatchSide side={match.side2} matchStatus={match.status} isByeSide={isSide2Bye} />
    </div>
  {/if}

  {#if showPopover && hasGames && match.games}
    <div class="game-popover">
      <div class="flex items-center gap-3 mb-1.5 text-text-muted font-medium">
        <span class="flex-1 text-right truncate">{match.side1.label}</span>
        <span class="w-6"></span>
        <span class="flex-1 truncate">{match.side2.label}</span>
      </div>
      {#each match.games as game}
        {@const s1Wins = game.side1Score > game.side2Score}
        {@const s2Wins = game.side2Score > game.side1Score}
        <div class="game-row">
          <span
            class="flex-1 text-right tabular-nums {s1Wins
              ? 'text-success-400 font-semibold'
              : 'text-text-muted'}"
          >
            {game.side1Score}
          </span>
          <span class="game-num">G{game.gameNumber}</span>
          <span
            class="flex-1 tabular-nums {s2Wins
              ? 'text-success-400 font-semibold'
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
