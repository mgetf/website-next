<script lang="ts">
  import type { RoundRobinStanding } from '$lib/types/bracket';
  import Badge from '$lib/components/ui/Badge.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';

  interface Props {
    standings: RoundRobinStanding[];
  }

  interface StandingRow {
    standing: RoundRobinStanding;
    rank: number;
    gameDifference: number;
  }

  let { standings }: Props = $props();

  const columns: Column[] = [
    { key: 'rank', label: 'Rank', align: 'center', width: '4rem' },
    { key: 'participant', label: 'Participant' },
    { key: 'played', label: 'P', align: 'center' },
    { key: 'wins', label: 'W', align: 'center' },
    { key: 'losses', label: 'L', align: 'center' },
    { key: 'draws', label: 'D', align: 'center' },
    { key: 'difference', label: 'GD', align: 'center' },
    { key: 'points', label: 'Pts', align: 'center' },
  ];

  const rows = $derived.by(() =>
    [...standings]
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.gamesWon - b.gamesLost - (a.gamesWon - a.gamesLost) ||
          b.wins - a.wins ||
          a.label.localeCompare(b.label),
      )
      .map((standing, index) => ({
        standing,
        rank: index + 1,
        gameDifference: standing.gamesWon - standing.gamesLost,
      })),
  );
</script>

<DataTable data={rows} {columns} compact emptyMessage="No standings available">
  {#snippet cell(row: StandingRow, column: Column)}
    {#if column.key === 'rank'}
      <span class="text-sm font-semibold text-text-muted">{row.rank}</span>
    {:else if column.key === 'participant'}
      <div class="flex min-w-0 items-center gap-2">
        {#if row.standing.steamId}
          <a
            href="/users/{row.standing.steamId}"
            class="truncate text-sm font-semibold text-white transition-colors hover:text-primary-400"
          >
            {row.standing.label}
          </a>
        {:else}
          <span class="truncate text-sm font-semibold text-white">{row.standing.label}</span>
        {/if}
        {#if row.standing.isEliminated}
          <Badge color="red" size="sm">Out</Badge>
        {/if}
      </div>
    {:else if column.key === 'played'}
      <span class="text-sm tabular-nums text-text-body">{row.standing.played}</span>
    {:else if column.key === 'wins'}
      <span class="text-sm tabular-nums text-success-400">{row.standing.wins}</span>
    {:else if column.key === 'losses'}
      <span class="text-sm tabular-nums text-text-body">{row.standing.losses}</span>
    {:else if column.key === 'draws'}
      <span class="text-sm tabular-nums text-text-body">{row.standing.draws}</span>
    {:else if column.key === 'difference'}
      <span
        class="text-sm tabular-nums {row.gameDifference > 0
          ? 'text-success-400'
          : row.gameDifference < 0
            ? 'text-danger-400'
            : 'text-text-body'}"
      >
        {row.gameDifference > 0 ? '+' : ''}{row.gameDifference}
      </span>
    {:else if column.key === 'points'}
      <span class="text-sm font-bold tabular-nums text-white">{row.standing.points}</span>
    {/if}
  {/snippet}
</DataTable>
