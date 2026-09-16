<script lang="ts">
  import { resolve } from '$app/paths';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import FormatBadge from '$lib/components/ui/FormatBadge.svelte';
  import FormatIcon from '$lib/components/ui/FormatIcon.svelte';
  import SeasonScope from '$lib/components/ui/SeasonScope.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import { PROVISIONAL_RATING_TITLE, ratingValue, visibleServerRatings } from '$lib/utils/rating';
  import { flagForRegion } from '$lib/utils/regions';
  import type { MgeRating, PlatformRegion } from '$lib/types/mge';
  import type { ProfileMatch } from '$lib/types/match';
  import type { PlayerServerStats, Profile1v1Entry, ProfileTeam } from '$lib/types/profile';
  import {
    chartPointsFromSeries,
    formatDate,
    placementClass,
    resultClass,
    statusColor,
    statusLabel,
    teamFormatsIn,
    winPct,
  } from '$lib/utils/profile';
  import RatingTrend from './RatingTrend.svelte';

  const DEFAULT_AVATAR = '/default-avatar.png';

  const matchColumns: Column[] = [
    { key: 'match', label: 'Match' },
    { key: 'arena', label: 'Arena' },
    { key: 'team', label: 'Team' },
    { key: 'score', label: 'Score', align: 'center' },
    { key: 'opponent', label: 'Opponent' },
  ];

  let {
    ratings,
    regions,
    steamId,
    playerName,
    playerAvatar,
    isOwn,
    entries1v1,
    teams,
    achievements,
    tournaments,
    fightNights,
    onOpen1v1,
    previewCompactSeries,
    formats = [],
  }: {
    ratings: MgeRating[];
    regions: PlatformRegion[];
    steamId: string;
    playerName: string;
    playerAvatar: string | null;
    isOwn: boolean;
    entries1v1: Profile1v1Entry[];
    teams: ProfileTeam[];
    achievements: { placement: string; event: string; date: string | null }[];
    tournaments: { id: number; name: string; date: string | null; placement: string }[];
    fightNights: {
      id: number;
      fightNightName: string;
      opponent: string;
      result: string;
      score: string;
      date: string | null;
    }[];
    onOpen1v1: () => void;
    previewCompactSeries?: { label: string; value: number }[];
    formats?: { code: string; name: string; iconUrl: string | null }[];
  } = $props();

  const shownRatings = $derived(visibleServerRatings(ratings));
  const active1v1 = $derived(entries1v1.find((e) => e.active) ?? null);
  const currentTeams = $derived(teams.filter((t) => t.active));
  const currentTeam = $derived(currentTeams[0] ?? null);
  const formatTabs = $derived(teamFormatsIn(teams));
  const iconByCode = $derived(new Map(formats.map((format) => [format.code, format.iconUrl])));
  const icon1v1 = $derived(iconByCode.get('1v1') ?? null);
  const icon2v2 = $derived(iconByCode.get('2v2') ?? null);

  let selected1v1SeasonId = $state('');
  const selected1v1Entry = $derived(
    entries1v1.find((entry) => String(entry.id) === selected1v1SeasonId) ?? entries1v1[0],
  );
  let selectedHistoryTeamId = $state('');
  let pickedFormat = $state<string | null>(null);
  let compactSeries = $state<{ label: string; value: number }[]>([]);

  const historyFormat = $derived.by(() => {
    if (pickedFormat && formatTabs.some((format) => format.code === pickedFormat)) {
      return pickedFormat;
    }
    const fromActive = currentTeams[0]?.formatCode;
    if (fromActive && formatTabs.some((format) => format.code === fromActive)) return fromActive;
    return formatTabs[0]?.code ?? null;
  });
  const historyTeams = $derived(
    historyFormat ? teams.filter((team) => team.formatCode === historyFormat) : [],
  );
  const selectedHistoryTeam = $derived(
    historyTeams.find((team) => String(team.teamId) === selectedHistoryTeamId) ?? historyTeams[0],
  );

  // A team ID can be re-registered into a new real-world season, so its match
  // history can span multiple seasons — pick which one to display, like /teams/[id].
  let selectedTeamSeasonId = $state('');
  const teamSeasons = $derived(selectedHistoryTeam?.matchesBySeason ?? []);
  const selectedTeamSeason = $derived(
    teamSeasons.find((season) => String(season.seasonId) === selectedTeamSeasonId) ??
      teamSeasons[0],
  );

  $effect(() => {
    if (!entries1v1.some((entry) => String(entry.id) === selected1v1SeasonId)) {
      selected1v1SeasonId = entries1v1[0] ? String(entries1v1[0].id) : '';
    }
  });

  $effect(() => {
    if (!historyTeams.some((team) => String(team.teamId) === selectedHistoryTeamId)) {
      selectedHistoryTeamId = historyTeams[0] ? String(historyTeams[0].teamId) : '';
    }
  });

  $effect(() => {
    if (!teamSeasons.some((season) => String(season.seasonId) === selectedTeamSeasonId)) {
      selectedTeamSeasonId = teamSeasons[0] ? String(teamSeasons[0].seasonId) : '';
    }
  });

  $effect(() => {
    const rating = shownRatings.length === 1 ? shownRatings[0] : null;
    if (!rating) {
      compactSeries = [];
      return;
    }
    if (previewCompactSeries) {
      compactSeries = previewCompactSeries;
      return;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      region: rating.region,
      days: 'all',
      tz,
    });
    let cancelled = false;
    void fetch(`/api/users/${encodeURIComponent(steamId)}/server-stats?${params}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as PlayerServerStats;
      })
      .then((stats) => {
        if (cancelled || !stats) return;
        compactSeries = chartPointsFromSeries(stats.rating.series);
      })
      .catch(() => {
        if (!cancelled) compactSeries = [];
      });
    return () => {
      cancelled = true;
    };
  });

  function ratingGridClass(count: number): string {
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-3';
    if (count === 4) return 'grid-cols-2 lg:grid-cols-4';
    if (count === 5) return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5';
    if (count === 6) return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6';
    return 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-7';
  }
</script>

<div class="space-y-6">
  {#snippet opponentCell(match: ProfileMatch, mode: 'team' | 'match')}
    {#if mode === 'team'}
      {#if match.opponentId}
        <a
          href={resolve('/teams/[id]', { id: String(match.opponentId) })}
          class="inline-flex items-center gap-2 text-sm font-medium text-white transition-colors hover:text-primary-400"
        >
          <img
            src={match.opponentAvatar || DEFAULT_AVATAR}
            alt=""
            class="size-5 rounded object-cover"
          />
          {match.opponentName}
        </a>
      {:else}
        <span class="text-sm text-text-muted italic">{match.opponentName}</span>
      {/if}
    {:else if match.result === 'TBD' || match.opponentName === 'TBD'}
      <span class="text-sm text-text-muted italic">{match.opponentName}</span>
    {:else}
      <a
        href={resolve('/matches/[id]', { id: String(match.matchId) })}
        class="inline-flex items-center gap-2 text-sm font-medium text-white transition-colors hover:text-primary-400"
      >
        <img
          src={match.opponentAvatar || DEFAULT_AVATAR}
          alt=""
          class="size-5 rounded object-cover"
        />
        {match.opponentName}
      </a>
    {/if}
  {/snippet}

  {#snippet matchHistoryTable(
    matches: ProfileMatch[],
    selfName: string,
    selfAvatar: string | null,
    opponentMode: 'team' | 'match',
  )}
    <DataTable
      data={matches}
      columns={matchColumns}
      compact
      emptyMessage="No matches this season"
      rowClass={(match) => (match.result === 'TBD' ? 'opacity-50' : '')}
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
          <span
            class="inline-flex items-center gap-2 text-sm font-semibold {resultClass(match.result)}"
          >
            <img src={selfAvatar || DEFAULT_AVATAR} alt="" class="size-5 rounded object-cover" />
            {selfName}
          </span>
        {:else if col.key === 'score'}
          <span class="font-mono text-sm tabular-nums {resultClass(match.result)}"
            >{match.score ?? '—'}</span
          >
        {:else if col.key === 'opponent'}
          {@render opponentCell(match, opponentMode)}
        {/if}
      {/snippet}
    </DataTable>
  {/snippet}

  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold text-white">Server rating</h2>
      <Button variant="primary" size="sm" href="/logs?player={steamId}">Logs</Button>
    </div>
    {#if shownRatings.length === 0}
      <p class="text-sm text-text-muted">
        No server rating yet. This player has not played on an MGE server.
      </p>
    {:else if shownRatings.length === 1 && shownRatings[0]}
      {@const rating = shownRatings[0]}
      {@const flagCode = flagForRegion(rating.region, regions)}
      {@const series = compactSeries}
      {@const games = (rating.wins ?? 0) + (rating.losses ?? 0)}
      <Card padding="none" class="overflow-hidden">
        <div
          class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5 sm:py-4 lg:gap-8"
        >
          <div class="flex shrink-0 items-center gap-4">
            <FlagIcon code={flagCode} class="h-6 w-9 rounded" />
            <div>
              <p class="text-sm font-medium text-text-label">{rating.region.toUpperCase()}</p>
              <p
                class="text-3xl font-black tabular-nums text-white"
                title={rating.provisional ? PROVISIONAL_RATING_TITLE : undefined}
              >
                {ratingValue(rating.elo)}{#if rating.provisional}<span class="text-text-muted"
                    >?</span
                  >{/if}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap gap-x-8 gap-y-3">
            <div>
              <p class="text-xs text-text-muted">Record</p>
              <p class="mt-1 text-sm">
                <span class="text-success-400">{rating.wins ?? 0}W</span>
                <span class="mx-0.5 text-text-muted">/</span>
                <span class="text-danger-400">{rating.losses ?? 0}L</span>
                {#if games > 0}
                  <span class="ml-2 text-text-muted"
                    >{winPct(rating.wins ?? 0, rating.losses ?? 0)}%</span
                  >
                {/if}
              </p>
            </div>
            <div>
              <p class="text-xs text-text-muted">Last played</p>
              <p class="mt-1 text-sm text-text-label">{formatDate(rating.lastPlayed)}</p>
            </div>
          </div>

          {#if series.length > 0}
            <div class="min-w-0 flex-1">
              <RatingTrend points={series} compact />
            </div>
          {/if}
        </div>
      </Card>
    {:else}
      <div class={['grid gap-3', ratingGridClass(shownRatings.length)]}>
        {#each shownRatings as rating (rating.region)}
          {@const flagCode = flagForRegion(rating.region, regions)}
          {@const wide = shownRatings.length <= 3}
          <Card padding="sm" class="h-full">
            {#if wide}
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="flex items-center gap-2">
                    <FlagIcon code={flagCode} class="h-4 w-6 rounded" />
                    <span class="text-sm font-medium text-text-label"
                      >{rating.region.toUpperCase()}</span
                    >
                  </div>
                  <p
                    class="mt-2 text-2xl font-black tabular-nums text-white"
                    title={rating.provisional ? PROVISIONAL_RATING_TITLE : undefined}
                  >
                    {ratingValue(rating.elo)}{#if rating.provisional}<span class="text-text-muted"
                        >?</span
                      >{/if}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-xs">
                    <span class="text-success-400">{rating.wins ?? 0}W</span>
                    <span class="mx-0.5 text-text-muted">/</span>
                    <span class="text-danger-400">{rating.losses ?? 0}L</span>
                  </p>
                  <p class="mt-1 text-xs text-text-muted">{formatDate(rating.lastPlayed)}</p>
                </div>
              </div>
            {:else}
              <div class="flex items-center gap-2">
                <FlagIcon code={flagCode} class="h-4 w-6 rounded" />
                <span class="text-sm font-medium text-text-label"
                  >{rating.region.toUpperCase()}</span
                >
              </div>
              <p
                class="mt-2 text-2xl font-black tabular-nums text-white"
                title={rating.provisional ? PROVISIONAL_RATING_TITLE : undefined}
              >
                {ratingValue(rating.elo)}{#if rating.provisional}<span class="text-text-muted"
                    >?</span
                  >{/if}
              </p>
              <p class="mt-1 text-xs text-text-muted">
                <span class="text-success-400">{rating.wins ?? 0}W</span>
                <span class="mx-0.5">/</span>
                <span class="text-danger-400">{rating.losses ?? 0}L</span>
              </p>
            {/if}
          </Card>
        {/each}
      </div>
    {/if}
  </div>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="flex items-center justify-between px-5 py-3">
          <div>
            <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <FormatIcon name="1v1" src={icon1v1} size="sm" />
              1v1 league
            </h2>
            <p class="text-xs text-text-muted">Season entry on this profile</p>
          </div>
        </div>
      {/snippet}
      {#if active1v1}
        <div class="space-y-3 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p>
                <SeasonScope
                  region={active1v1.region}
                  seasonNum={active1v1.seasonNum}
                  division={active1v1.division}
                />
              </p>
              <p class="mt-1 font-mono text-sm text-format-1v1-400">
                {active1v1.wins}–{active1v1.losses}
                <span class="ml-2 font-sans text-xs text-text-muted"
                  >{winPct(active1v1.wins, active1v1.losses)}% WR</span
                >
              </p>
            </div>
            <Badge color={statusColor(active1v1.status)}>{statusLabel(active1v1.status)}</Badge>
          </div>
          {#if isOwn && !active1v1.isPaid && active1v1.signupCost > 0}
            <p class="text-sm text-warning-400">Signup fee still unpaid — ready-up is locked.</p>
          {/if}
          <div class="flex flex-wrap gap-2">
            {#if isOwn && !active1v1.isPaid && active1v1.signupCost > 0}
              <Button variant="warning" size="sm" href="/checkout/{steamId}">Go to checkout</Button>
            {/if}
          </div>
        </div>
      {:else}
        <div class="px-5 py-8 text-center">
          <p class="text-sm text-text-muted">No active 1v1 entry</p>
          {#if isOwn}
            <div class="mt-3">
              <Button href="/leagues/1v1" variant="format-1v1" size="sm">Browse 1v1 league</Button>
            </div>
          {/if}
        </div>
      {/if}
    </Card>

    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="flex items-center justify-between px-5 py-3">
          <div>
            <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <FormatIcon name="2v2" src={icon2v2} size="sm" />
              Team leagues
            </h2>
            <p class="text-xs text-text-muted">Roster HQ stays on the team page</p>
          </div>
        </div>
      {/snippet}
      {#if currentTeams.length === 0}
        <div class="px-5 py-8 text-center">
          <p class="text-sm text-text-muted">No active team</p>
          {#if isOwn}
            <div class="mt-3">
              <Button href="/teams" variant="secondary" size="sm">Browse teams</Button>
            </div>
          {/if}
        </div>
      {:else if currentTeams.length === 1 && currentTeam}
        <div class="space-y-3 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <img
                src={currentTeam.avatar || DEFAULT_AVATAR}
                alt=""
                class="size-12 shrink-0 rounded-lg object-cover"
              />
              <div class="min-w-0">
                <a
                  href={resolve('/teams/[id]', { id: String(currentTeam.teamId) })}
                  class="inline-flex items-center gap-1.5 font-semibold text-white transition-colors hover:text-primary-400"
                >
                  {#if currentTeam.formatIconUrl}
                    <Tooltip text={currentTeam.formatName}>
                      <FormatIcon
                        name={currentTeam.formatName}
                        src={currentTeam.formatIconUrl}
                        size="sm"
                      />
                    </Tooltip>
                  {/if}
                  {currentTeam.teamName}
                </a>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <SeasonScope
                    region={currentTeam.regionName}
                    seasonNum={currentTeam.seasonNum}
                    division={currentTeam.division}
                  />
                </p>
                <p class="mt-1 font-mono text-sm text-success-400">
                  {currentTeam.wins}–{currentTeam.losses}
                  <span class="ml-2 font-sans text-xs text-text-muted"
                    >{winPct(currentTeam.wins, currentTeam.losses)}% WR</span
                  >
                </p>
              </div>
            </div>
            <Badge color={statusColor(currentTeam.status)}>{statusLabel(currentTeam.status)}</Badge>
          </div>
        </div>
      {:else}
        <div class="divide-y divide-border-default/50">
          {#each currentTeams as team (team.teamId)}
            <div class="flex items-start gap-3 px-5 py-3">
              <img
                src={team.avatar || DEFAULT_AVATAR}
                alt=""
                class="size-10 shrink-0 rounded-lg object-cover"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <a
                    href={resolve('/teams/[id]', { id: String(team.teamId) })}
                    class="inline-flex items-center gap-1.5 font-semibold text-white transition-colors hover:text-primary-400"
                  >
                    {#if team.formatIconUrl}
                      <Tooltip text={team.formatName}>
                        <FormatIcon name={team.formatName} src={team.formatIconUrl} size="sm" />
                      </Tooltip>
                    {/if}
                    {team.teamName}
                  </a>
                  <Badge color={statusColor(team.status)}>{statusLabel(team.status)}</Badge>
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <SeasonScope
                    region={team.regionName}
                    seasonNum={team.seasonNum}
                    division={team.division}
                  />
                </p>
                <p class="mt-1 font-mono text-sm text-success-400">
                  {team.wins}–{team.losses}
                  <span class="ml-2 font-sans text-xs text-text-muted"
                    >{winPct(team.wins, team.losses)}% WR</span
                  >
                </p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Card>
  </div>

  {#if entries1v1.length > 0}
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            <FormatIcon name="1v1" src={icon1v1} size="sm" />
            1v1 history
          </h2>
          {#if entries1v1.length > 1}
            <div class="flex flex-wrap gap-1" role="group" aria-label="Season">
              {#each entries1v1 as entry (entry.id)}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {selected1v1SeasonId ===
                  String(entry.id)
                    ? 'border-primary-500 bg-primary-500/15 text-white'
                    : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
                  aria-pressed={selected1v1SeasonId === String(entry.id)}
                  onclick={() => (selected1v1SeasonId = String(entry.id))}
                >
                  Season {entry.seasonNum}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}
      {#if selected1v1Entry}
        <div class="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <p class="text-sm">
            <SeasonScope
              region={selected1v1Entry.region}
              seasonNum={selected1v1Entry.seasonNum}
              division={selected1v1Entry.division}
            />
          </p>
          <div class="flex items-center gap-3">
            <p class="text-xs text-text-muted">
              <span class="font-mono">{selected1v1Entry.wins}–{selected1v1Entry.losses}</span>
              <span class="ml-2">{winPct(selected1v1Entry.wins, selected1v1Entry.losses)}% WR</span>
            </p>
            <Badge color={statusColor(selected1v1Entry.status)}
              >{statusLabel(selected1v1Entry.status)}</Badge
            >
          </div>
        </div>
        {@render matchHistoryTable(selected1v1Entry.matches, playerName, playerAvatar, 'match')}
      {/if}
    </Card>
  {:else}
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
            <FormatIcon name="1v1" src={icon1v1} size="sm" />
            1v1 history
          </h2>
        </div>
      {/snippet}
      <p class="px-5 py-8 text-center text-sm text-text-muted">No 1v1 season history</p>
    </Card>
  {/if}

  <Card padding="none" class="overflow-hidden">
    {#snippet header()}
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <FormatIcon name="2v2" src={icon2v2} size="sm" />
          Team history
        </h2>
        {#if formatTabs.length > 1}
          <div class="flex flex-wrap gap-1" role="group" aria-label="Team format">
            {#each formatTabs as format (format.code)}
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {historyFormat ===
                format.code
                  ? 'border-primary-500 bg-primary-500/15 text-white'
                  : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
                aria-pressed={historyFormat === format.code}
                onclick={() => (pickedFormat = format.code)}
              >
                <FormatIcon
                  name={format.name}
                  src={iconByCode.get(format.code) ?? format.iconUrl}
                  size="sm"
                />
                {format.name}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/snippet}
    {#if historyTeams.length > 0}
      {#if historyTeams.length > 1}
        <div
          class="flex flex-wrap gap-1 border-b border-border-default/50 px-5 py-2"
          role="group"
          aria-label="Season"
        >
          {#each historyTeams as team (team.teamId)}
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {selectedHistoryTeamId ===
              String(team.teamId)
                ? 'border-primary-500 bg-primary-500/15 text-white'
                : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
              aria-pressed={selectedHistoryTeamId === String(team.teamId)}
              onclick={() => (selectedHistoryTeamId = String(team.teamId))}
            >
              Season {team.seasonNum}
            </button>
          {/each}
        </div>
      {/if}
      {#if selectedHistoryTeam}
        <div class="flex items-start justify-between gap-3 px-5 py-4">
          <div class="flex min-w-0 items-start gap-3">
            <img
              src={selectedHistoryTeam.avatar || DEFAULT_AVATAR}
              alt=""
              class="size-12 shrink-0 rounded-lg object-cover"
            />
            <div class="min-w-0">
              <a
                href={resolve('/teams/[id]', { id: String(selectedHistoryTeam.teamId) })}
                class="inline-flex min-w-0 items-center gap-1.5 font-semibold text-white transition-colors hover:text-primary-400"
              >
                {#if selectedHistoryTeam.formatIconUrl}
                  <Tooltip text={selectedHistoryTeam.formatName}>
                    <FormatIcon
                      name={selectedHistoryTeam.formatName}
                      src={selectedHistoryTeam.formatIconUrl}
                      size="sm"
                    />
                  </Tooltip>
                {/if}
                <span class="truncate">{selectedHistoryTeam.teamName}</span>
              </a>
              <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                <SeasonScope
                  region={selectedHistoryTeam.regionName}
                  seasonNum={selectedHistoryTeam.seasonNum}
                  division={selectedHistoryTeam.division}
                />
              </p>
              <p class="mt-1 font-mono text-sm text-success-400">
                {selectedHistoryTeam.wins}–{selectedHistoryTeam.losses}
                <span class="ml-2 font-sans text-xs text-text-muted"
                  >{winPct(selectedHistoryTeam.wins, selectedHistoryTeam.losses)}% WR</span
                >
              </p>
            </div>
          </div>
          <Badge color={statusColor(selectedHistoryTeam.status)}
            >{statusLabel(selectedHistoryTeam.status)}</Badge
          >
        </div>
        {#if teamSeasons.length > 0}
          {#if teamSeasons.length > 1}
            <div
              class="flex flex-wrap gap-1 border-t border-border-default/50 px-5 py-2"
              role="group"
              aria-label="Match history season"
            >
              {#each teamSeasons as seasonData (seasonData.seasonId)}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {selectedTeamSeasonId ===
                  String(seasonData.seasonId)
                    ? 'border-primary-500 bg-primary-500/15 text-white'
                    : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
                  aria-pressed={selectedTeamSeasonId === String(seasonData.seasonId)}
                  onclick={() => (selectedTeamSeasonId = String(seasonData.seasonId))}
                >
                  Season {seasonData.seasonNum}
                </button>
              {/each}
            </div>
          {/if}
          {#if selectedTeamSeason}
            {@render matchHistoryTable(
              selectedTeamSeason.matches,
              selectedHistoryTeam.teamName,
              selectedHistoryTeam.avatar,
              'team',
            )}
          {/if}
        {:else}
          <p class="px-5 py-8 text-center text-sm text-text-muted">No matches recorded</p>
        {/if}
      {/if}
    {:else}
      <p class="px-5 py-8 text-center text-sm text-text-muted">No team history</p>
    {/if}
  </Card>

  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Achievements</h2>
        </div>
      {/snippet}
      {#if achievements.length > 0}
        <div class="divide-y divide-border-default/50">
          {#each achievements as achievement (achievement.event)}
            <div class="px-5 py-3">
              <p class="text-sm text-white">
                <span class="font-bold {placementClass(achievement.placement)}"
                  >{achievement.placement}</span
                >
                <span class="ml-2">{achievement.event}</span>
              </p>
              <p class="mt-0.5 text-xs text-text-muted">{formatDate(achievement.date)}</p>
            </div>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-8 text-center text-sm text-text-muted">No achievements yet</p>
      {/if}
    </Card>

    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Tournaments</h2>
        </div>
      {/snippet}
      {#if tournaments.length > 0}
        <div class="divide-y divide-border-default/50">
          {#each tournaments as t (t.id)}
            <div class="flex items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm text-white">{t.name}</p>
                <p class="text-xs text-text-muted">{formatDate(t.date)}</p>
              </div>
              <span class="text-xs font-bold whitespace-nowrap {placementClass(t.placement)}"
                >{t.placement}</span
              >
            </div>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-8 text-center text-sm text-text-muted">No tournament history</p>
      {/if}
    </Card>

    <Card padding="none" class="overflow-hidden">
      {#snippet header()}
        <div class="px-5 py-3">
          <h2 class="text-sm font-semibold text-white">Fight nights</h2>
        </div>
      {/snippet}
      {#if fightNights.length > 0}
        <div class="divide-y divide-border-default/50">
          {#each fightNights as fn (fn.id)}
            <div class="flex items-center justify-between gap-3 px-5 py-3">
              <div class="min-w-0">
                <p class="text-sm text-white">{fn.fightNightName}</p>
                <p class="text-xs text-text-muted">vs {fn.opponent}</p>
              </div>
              <span class="font-mono text-xs font-bold {resultClass(fn.result)}"
                >{fn.result} {fn.score}</span
              >
            </div>
          {/each}
        </div>
      {:else}
        <p class="px-5 py-8 text-center text-sm text-text-muted">No fight night history</p>
      {/if}
    </Card>
  </div>
</div>
