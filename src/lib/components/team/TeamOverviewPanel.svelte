<script lang="ts">
  import { resolve } from '$app/paths';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type {
    TeamAchievement,
    TeamMatchRow,
    TeamPastPlayer,
    TeamRosterPlayer,
    TeamSeasonMatches,
  } from '$lib/types/team';
  import { formatDate, placementClass, resultClass } from '$lib/utils/profile';
  import Trophy from '~icons/lucide/trophy';

  const DEFAULT_AVATAR = '/default-avatar.png';

  const matchColumns: Column[] = [
    { key: 'match', label: 'Match' },
    { key: 'arena', label: 'Arena' },
    { key: 'team', label: 'Team' },
    { key: 'score', label: 'Score', align: 'center' },
    { key: 'opponent', label: 'Opponent' },
  ];

  let {
    teamName,
    teamAvatar,
    currentRoster,
    pastRoster,
    matchesBySeason,
    achievements,
    maxRosterSize,
    showPaymentBadges,
    currentUserSteamId,
    canLeave,
    onLeaveTeam,
  }: {
    teamName: string;
    teamAvatar: string | null;
    currentRoster: TeamRosterPlayer[];
    pastRoster: TeamPastPlayer[];
    matchesBySeason: TeamSeasonMatches[];
    achievements: TeamAchievement[];
    maxRosterSize: number;
    showPaymentBadges: boolean;
    currentUserSteamId: string | null;
    canLeave: boolean;
    onLeaveTeam: () => void;
  } = $props();

  let selectedSeasonId = $state('');
  const selectedSeason = $derived(
    matchesBySeason.find(({ seasonId }) => String(seasonId) === selectedSeasonId) ??
      matchesBySeason[0],
  );

  $effect(() => {
    if (!matchesBySeason.some(({ seasonId }) => String(seasonId) === selectedSeasonId)) {
      selectedSeasonId = matchesBySeason[0] ? String(matchesBySeason[0].seasonId) : '';
    }
  });

  function isBye(match: TeamMatchRow): boolean {
    return match.type === 'bye' || match.result === 'BYE';
  }

  function matchRowClass(match: TeamMatchRow): string {
    return match.result === 'TBD' ? 'opacity-50' : '';
  }
</script>

{#snippet seasonSchedule(seasonData: TeamSeasonMatches)}
  <DataTable
    data={seasonData.matches}
    columns={matchColumns}
    compact
    emptyMessage="No matches this season"
    rowClass={matchRowClass}
  >
    {#snippet cell(match, col)}
      {#if col.key === 'match'}
        {#if match.matchId}
          <a
            href={resolve('/matches/[id]', { id: String(match.matchId) })}
            class="text-sm font-medium text-primary-400 transition-colors hover:text-primary-300"
          >
            {match.week}
          </a>
        {:else}
          <span class="text-sm text-text-muted">{match.week}</span>
        {/if}
      {:else if col.key === 'arena'}
        {#if match.arenas.length === 0}
          <span class="text-sm text-text-muted">—</span>
        {:else}
          <div class="flex flex-wrap items-center gap-2">
            {#each match.arenas as arena (arena.id)}
              <span class="inline-flex items-center gap-1.5 text-sm text-text-label">
                {#if arena.avatar}
                  <img src={arena.avatar} alt="" class="size-6 rounded object-cover" />
                {/if}
                {arena.name}
              </span>
            {/each}
          </div>
        {/if}
      {:else if col.key === 'team'}
        {#if isBye(match)}
          <Badge color="yellow">Bye week</Badge>
        {:else}
          <span
            class="inline-flex items-center gap-2 text-sm font-semibold {resultClass(match.result)}"
          >
            <img src={teamAvatar || DEFAULT_AVATAR} alt="" class="size-5 rounded object-cover" />
            {teamName}
          </span>
        {/if}
      {:else if col.key === 'score'}
        <span class="font-mono text-sm tabular-nums {resultClass(match.result)}"
          >{match.score ?? '—'}</span
        >
      {:else if col.key === 'opponent'}
        {#if isBye(match)}
          <span class="text-sm text-text-muted">—</span>
        {:else if match.opponentId && match.opponent}
          <a
            href={resolve('/teams/[id]', { id: String(match.opponentId) })}
            class="inline-flex items-center gap-2 text-sm font-medium text-white transition-colors hover:text-primary-400"
          >
            <img
              src={match.opponentAvatar || DEFAULT_AVATAR}
              alt=""
              class="size-5 rounded object-cover"
            />
            {match.opponent}
          </a>
        {:else}
          <span class="text-sm text-text-muted italic">{match.opponent ?? 'TBD'}</span>
        {/if}
      {/if}
    {/snippet}
  </DataTable>
{/snippet}

<div class="space-y-6">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">
            Current roster
            <span class="ml-1 font-normal text-text-muted"
              >({currentRoster.length}/{maxRosterSize})</span
            >
          </h2>
        </div>
      {/snippet}
      {#if currentRoster.length > 0}
        <div class="divide-y divide-border-default/50">
          {#each currentRoster as player (player.steamId)}
            <div class="flex items-center gap-3 px-5 py-3">
              <a
                href={resolve('/users/[steamId]', { steamId: player.steamId })}
                class="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
              >
                <img
                  src={player.avatar || DEFAULT_AVATAR}
                  alt=""
                  class="size-10 shrink-0 rounded-lg object-cover"
                />
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="truncate text-sm font-semibold text-white">{player.name}</span>
                    {#if player.isLeader}
                      <Badge color="yellow"
                        >{player.permissionLevel === 2 ? 'Owner' : 'Admin'}</Badge
                      >
                    {/if}
                    {#if showPaymentBadges && !player.isPaid}
                      <Badge color="red">Unpaid</Badge>
                    {/if}
                  </div>
                  <p class="mt-0.5 text-xs text-text-muted">Joined {formatDate(player.joinedAt)}</p>
                </div>
              </a>
              {#if canLeave && player.steamId === currentUserSteamId}
                <Button variant="danger" size="sm" onclick={onLeaveTeam}>Leave</Button>
              {/if}
            </div>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-8 text-center text-sm text-text-muted">No active players</p>
      {/if}
    </Card>

    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Achievements</h2>
        </div>
      {/snippet}
      {#if achievements.length > 0}
        <div class="divide-y divide-border-default/50">
          {#each achievements as achievement (achievement.id)}
            <div class="px-5 py-3">
              <p class="text-sm text-white">
                <span class="font-bold {placementClass(achievement.placement)}"
                  >{achievement.placement}</span
                >
                <span class="ml-2">{achievement.name}</span>
              </p>
              <p class="mt-0.5 text-xs text-text-muted">{formatDate(achievement.date)}</p>
            </div>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-8 text-center text-sm text-text-muted">
          No recorded event placements for this team
        </p>
      {/if}
    </Card>
  </div>

  {#if matchesBySeason.length > 0}
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Match history</h2>
          {#if matchesBySeason.length > 1}
            <div class="flex flex-wrap gap-1" role="group" aria-label="Season">
              {#each matchesBySeason as seasonData (seasonData.seasonId)}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {selectedSeasonId ===
                  String(seasonData.seasonId)
                    ? 'border-primary-500 bg-primary-500/15 text-white'
                    : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
                  aria-pressed={selectedSeasonId === String(seasonData.seasonId)}
                  onclick={() => (selectedSeasonId = String(seasonData.seasonId))}
                >
                  {seasonData.season}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}
      {#if selectedSeason}
        {@render seasonSchedule(selectedSeason)}
      {/if}
    </Card>
  {:else}
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Match history</h2>
        </div>
      {/snippet}
      <div class="px-5 py-8 text-center">
        <div class="mb-3 flex justify-center text-text-muted">
          <Trophy class="size-10 opacity-50" />
        </div>
        <p class="text-sm text-text-muted">No match history yet</p>
      </div>
    </Card>
  {/if}

  <Card padding="none" class="overflow-hidden">
    {#snippet header()}
      <div class="px-5 py-3">
        <h2 class="text-sm font-semibold text-white">Past roster</h2>
      </div>
    {/snippet}
    {#if pastRoster.length > 0}
      <div class="divide-y divide-border-default/50">
        {#each pastRoster as player (player.steamId)}
          <a
            href={resolve('/users/[steamId]', { steamId: player.steamId })}
            class="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover/40"
          >
            <img
              src={player.avatar || DEFAULT_AVATAR}
              alt=""
              class="size-10 shrink-0 rounded-lg object-cover opacity-60"
            />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-white">{player.name}</p>
              <p class="text-xs text-text-muted">
                {formatDate(player.joinedAt)} – {formatDate(player.leftAt)}
              </p>
            </div>
          </a>
        {/each}
      </div>
    {:else}
      <p class="px-5 py-8 text-center text-sm text-text-muted">No past players on this team</p>
    {/if}
  </Card>
</div>
