<script lang="ts">
  import Badge from '#lib/components/ui/Badge.svelte';
  import type { LeagueDivisionMatch, LeagueScheduleRow } from '#lib/types/league.js';
  import {
    filterLeagueMatchesByWeek,
    formatLeagueMatchScore,
    groupLeagueMatchesByWeek,
    isLeagueMatchSideWinner,
    latestLeagueWeek,
    leagueWeekNumbers,
  } from '#lib/utils/leagueMatches.js';

  interface Props {
    matches: LeagueScheduleRow[];
    viewerTeamId?: number;
  }

  let { matches, viewerTeamId }: Props = $props();

  const weekNumbers = $derived(leagueWeekNumbers(matches));
  const latestWeek = $derived(latestLeagueWeek(matches));
  let weekSelection = $state<number | 'all' | 'auto'>('auto');

  const weekKey = $derived(
    `${weekNumbers.join(',')}:${matches.map((match) => `${match.kind}-${match.id}`).join(',')}`,
  );
  $effect(() => {
    weekKey;
    weekSelection = 'auto';
  });

  const activeWeek = $derived.by((): number | 'all' => {
    if (weekSelection === 'auto') return latestWeek ?? 'all';
    return weekSelection;
  });

  const visibleMatches = $derived(filterLeagueMatchesByWeek(matches, activeWeek));
  const weeks = $derived(groupLeagueMatchesByWeek(visibleMatches));
  const showWeekHeaders = $derived(activeWeek === 'all');
  const showWeekPills = $derived(weekNumbers.length > 1);

  const defaultAvatar =
    'https://avatars.steamstatic.com/b5bd56c1aa4644a474a2e4972be27ef9e82e517e_full.jpg';

  function sideClass(match: LeagueDivisionMatch, side: 'home' | 'away'): string {
    if (match.homeScore == null || match.awayScore == null) return 'text-text-heading';
    if (isLeagueMatchSideWinner(match, side)) return 'text-text-heading font-semibold';
    if (match.homeScore === match.awayScore) return 'text-text-heading';
    return 'text-text-muted';
  }

  function isViewerRow(row: LeagueScheduleRow): boolean {
    if (viewerTeamId == null) return false;
    if (row.kind === 'bye') return row.team.id === viewerTeamId;
    return row.home.id === viewerTeamId || row.away.id === viewerTeamId;
  }

  function pillClass(selected: boolean): string {
    return selected
      ? 'bg-surface-hover text-text-heading'
      : 'text-text-muted hover:text-text-heading hover:bg-surface-input/50';
  }
</script>

<div
  class="bg-surface-card/80 backdrop-blur border border-border-default rounded-lg overflow-hidden"
>
  <div
    class="flex items-center justify-between gap-3 px-4 py-2 border-b border-border-default bg-surface-card/80"
  >
    <h3 class="text-sm font-semibold text-text-label shrink-0">Matches</h3>
    {#if showWeekPills}
      <div class="flex flex-wrap justify-end gap-1" role="group" aria-label="Match week">
        {#each weekNumbers as weekNo (weekNo)}
          <button
            type="button"
            aria-pressed={activeWeek === weekNo}
            onclick={() => (weekSelection = weekNo)}
            class="px-2 py-0.5 rounded text-xs font-medium transition-colors {pillClass(
              activeWeek === weekNo,
            )}"
          >
            W{weekNo}
          </button>
        {/each}
        <button
          type="button"
          aria-pressed={activeWeek === 'all'}
          onclick={() => (weekSelection = 'all')}
          class="px-2 py-0.5 rounded text-xs font-medium transition-colors {pillClass(
            activeWeek === 'all',
          )}"
        >
          All
        </button>
      </div>
    {/if}
  </div>

  {#if weeks.length === 0}
    <p class="px-4 py-6 text-center text-sm text-text-body">
      No matches scheduled for this division yet.
    </p>
  {:else}
    {#each weeks as week, weekIndex (week.weekNo)}
      <section>
        {#if showWeekHeaders}
          <h4
            class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-text-label bg-surface-input/40 {weekIndex >
            0
              ? 'border-t border-border-default'
              : ''}"
          >
            {week.weekLabel}
          </h4>
        {/if}
        <ul
          class="divide-y divide-border-default {showWeekHeaders
            ? 'border-t border-border-default'
            : ''}"
        >
          {#each week.matches as row (`${row.kind}-${row.id}`)}
            <li>
              {#if row.kind === 'bye'}
                <a
                  href={row.href}
                  class="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-x-2 px-4 py-1.5 hover:bg-surface-input/50 transition-colors {isViewerRow(
                    row,
                  )
                    ? 'bg-primary-500/10'
                    : ''}"
                >
                  <span class="flex min-w-0 items-center justify-end gap-1.5">
                    <span class="truncate text-xs text-text-heading">{row.team.name}</span>
                    <img
                      src={row.team.avatar || defaultAvatar}
                      alt=""
                      class="h-5 w-5 shrink-0 rounded object-cover"
                    />
                  </span>
                  <span class="flex justify-center">
                    <Badge color="yellow">Bye</Badge>
                  </span>
                  <span></span>
                </a>
              {:else}
                {@const score = formatLeagueMatchScore(row)}
                <a
                  href={row.href}
                  class="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-x-2 px-4 py-1.5 hover:bg-surface-input/50 transition-colors {isViewerRow(
                    row,
                  )
                    ? 'bg-primary-500/10'
                    : ''}"
                >
                  <span class="flex min-w-0 items-center justify-end gap-1.5">
                    <span class="truncate text-xs {sideClass(row, 'home')}">{row.home.name}</span>
                    <img
                      src={row.home.avatar || defaultAvatar}
                      alt=""
                      class="h-5 w-5 shrink-0 rounded object-cover"
                    />
                  </span>

                  <span
                    class="text-center text-xs {score
                      ? 'tabular-nums font-semibold text-text-heading'
                      : 'font-medium text-text-muted'}"
                  >
                    {score ?? 'vs'}
                  </span>

                  <span class="flex min-w-0 items-center gap-1.5">
                    <img
                      src={row.away.avatar || defaultAvatar}
                      alt=""
                      class="h-5 w-5 shrink-0 rounded object-cover"
                    />
                    <span class="truncate text-xs {sideClass(row, 'away')}">{row.away.name}</span>
                  </span>
                </a>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>
