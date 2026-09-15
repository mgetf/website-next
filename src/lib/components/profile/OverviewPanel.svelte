<script lang="ts">
  import { resolve } from '$app/paths';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import FormatBadge from '$lib/components/ui/FormatBadge.svelte';
  import FormatIcon from '$lib/components/ui/FormatIcon.svelte';
  import ChevronDown from '~icons/lucide/chevron-down';
  import { PROVISIONAL_RATING_TITLE, ratingValue, visibleServerRatings } from '$lib/utils/rating';
  import { flagForRegion } from '$lib/utils/regions';
  import { getRegionAbbr } from '$lib/utils/region';
  import type { MgeRating, PlatformRegion } from '$lib/types/mge';
  import type { PlayerServerStats, Profile1v1Entry, ProfileTeam } from '$lib/types/profile';
  import {
    chartPointsFromSeries,
    formatDate,
    placementClass,
    resultChipClass,
    resultClass,
    statusColor,
    statusLabel,
    teamFormatsIn,
    winPct,
  } from '$lib/utils/profile';
  import RatingTrend from './RatingTrend.svelte';

  const DEFAULT_AVATAR = '/default-avatar.png';

  let {
    ratings,
    regions,
    steamId,
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

  let open1v1 = $state<Record<number, boolean>>({});
  let openTeams = $state<Record<number, boolean>>({});
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

  function isOpen1v1(entry: Profile1v1Entry): boolean {
    return entry.id in open1v1 ? open1v1[entry.id]! : entry.active;
  }

  function isOpenTeam(team: ProfileTeam): boolean {
    return team.teamId in openTeams ? openTeams[team.teamId]! : team.active;
  }

  function ratingGridClass(count: number): string {
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2';
    if (count === 3) return 'grid-cols-1 md:grid-cols-3';
    if (count === 4) return 'grid-cols-2 lg:grid-cols-4';
    if (count === 5) return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5';
    if (count === 6) return 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6';
    return 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-7';
  }

  function sentenceCase(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  function regionFlag(regionName: string): string {
    return flagForRegion(getRegionAbbr(regionName));
  }
</script>

<div class="space-y-6">
  {#snippet seasonScope(regionName: string, seasonNum: number, division: string)}
    {@const flagCode = regionFlag(regionName)}
    <span class="inline-flex items-center gap-2 font-semibold text-white">
      {#if flagCode}
        <FlagIcon code={flagCode} class="h-4 w-6 rounded" />
      {/if}
      <span>
        Season {seasonNum}
        <span class="font-normal text-text-muted"> - {sentenceCase(division)}</span>
      </span>
    </span>
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
          <FormatBadge name="1v1" themeKey="purple" iconUrl={icon1v1} />
        </div>
      {/snippet}
      {#if active1v1}
        <div class="space-y-3 px-5 py-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p>
                {@render seasonScope(active1v1.region, active1v1.seasonNum, active1v1.division)}
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
            {#if isOwn}
              <Button variant="format-1v1" size="sm" onclick={onOpen1v1}>Manage entry</Button>
            {/if}
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
                  class="font-semibold text-white transition-colors hover:text-primary-400"
                >
                  {currentTeam.teamName}
                </a>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <FormatBadge
                    name={currentTeam.formatName}
                    themeKey={currentTeam.formatThemeKey}
                    iconUrl={currentTeam.formatIconUrl}
                  />
                  {@render seasonScope(
                    currentTeam.regionName,
                    currentTeam.seasonNum,
                    currentTeam.division,
                  )}
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
          <Button
            variant="secondary"
            size="sm"
            href={resolve('/teams/[id]', { id: String(currentTeam.teamId) })}>Open team page</Button
          >
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
                    class="font-semibold text-white transition-colors hover:text-primary-400"
                  >
                    {team.teamName}
                  </a>
                  <Badge color={statusColor(team.status)}>{statusLabel(team.status)}</Badge>
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <FormatBadge
                    name={team.formatName}
                    themeKey={team.formatThemeKey}
                    iconUrl={team.formatIconUrl}
                  />
                  {@render seasonScope(team.regionName, team.seasonNum, team.division)}
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

  <Card padding="none" class="overflow-hidden">
    {#snippet header()}
      <div class="px-5 py-3">
        <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <FormatIcon name="1v1" src={icon1v1} size="sm" />
          1v1 history
        </h2>
      </div>
    {/snippet}
    {#if entries1v1.length > 0}
      <div class="divide-y divide-border-default/50">
        {#each entries1v1 as entry (entry.id)}
          {@const open = isOpen1v1(entry)}
          <div class={entry.active ? 'bg-format-1v1-500/5' : ''}>
            <div class="flex items-center gap-3 px-5 py-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  {@render seasonScope(entry.region, entry.seasonNum, entry.division)}
                  <Badge color={statusColor(entry.status)}>{statusLabel(entry.status)}</Badge>
                </div>
                <p class="mt-1 text-xs text-text-muted">
                  <span class="font-mono">{entry.wins}–{entry.losses}</span>
                  <span class="ml-2">{winPct(entry.wins, entry.losses)}% WR</span>
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-label"
                aria-expanded={open}
                aria-label={open ? 'Collapse matches' : 'Expand matches'}
                onclick={() => (open1v1[entry.id] = !open)}
              >
                <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
              </button>
            </div>
            {#if open}
              {#if entry.matches.length > 0}
                <table class="w-full text-sm">
                  <thead>
                    <tr class="bg-surface-page/60 text-xs tracking-wide text-text-muted uppercase">
                      <th class="px-5 py-2 text-left font-medium">Week</th>
                      <th class="px-5 py-2 text-left font-medium">Opponent</th>
                      <th class="px-5 py-2 text-center font-medium">Result</th>
                      <th class="px-5 py-2 text-center font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each entry.matches as match (match.matchId)}
                      <tr
                        class="border-t border-border-default/30 {match.result === 'TBD'
                          ? 'opacity-50'
                          : ''}"
                      >
                        <td class="px-5 py-2.5 text-xs whitespace-nowrap text-text-muted"
                          >{match.week}</td
                        >
                        <td class="px-5 py-2.5">
                          {#if match.result === 'TBD' || match.opponentName === 'TBD'}
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
                        </td>
                        <td class="px-5 py-2.5 text-center">
                          <span
                            class="inline-block rounded border px-2 py-0.5 text-xs font-bold {resultChipClass(
                              match.result,
                            )}">{match.result}</span
                          >
                        </td>
                        <td
                          class="px-5 py-2.5 text-center font-mono text-xs {resultClass(
                            match.result,
                          )}">{match.score}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="px-5 py-4 text-sm text-text-muted">No matches scheduled yet.</p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <p class="px-5 py-8 text-center text-sm text-text-muted">No 1v1 season history</p>
    {/if}
  </Card>

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
      <div class="divide-y divide-border-default/50">
        {#each historyTeams as team (team.teamId)}
          {@const open = isOpenTeam(team)}
          <div class={team.active ? 'bg-success-500/5' : ''}>
            <div class="flex items-center gap-3 px-5 py-3">
              <img
                src={team.avatar || DEFAULT_AVATAR}
                alt=""
                class="size-10 shrink-0 rounded-lg object-cover"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <a
                    href={resolve('/teams/[id]', { id: String(team.teamId) })}
                    class="text-sm font-semibold text-white transition-colors hover:text-primary-400"
                  >
                    {team.teamName}
                  </a>
                  <Badge color={statusColor(team.status)}>{statusLabel(team.status)}</Badge>
                </div>
                <p class="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                  <FormatBadge
                    name={team.formatName}
                    themeKey={team.formatThemeKey}
                    iconUrl={team.formatIconUrl}
                  />
                  {@render seasonScope(team.regionName, team.seasonNum, team.division)}
                </p>
                <p class="mt-1 text-xs text-text-muted">
                  <span class="font-mono">{team.wins}–{team.losses}</span>
                  <span class="ml-2">{winPct(team.wins, team.losses)}% WR</span>
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-label"
                aria-expanded={open}
                aria-label={open ? 'Collapse matches' : 'Expand matches'}
                onclick={() => (openTeams[team.teamId] = !open)}
              >
                <ChevronDown class="size-4 transition-transform {open ? 'rotate-180' : ''}" />
              </button>
            </div>
            {#if open}
              {#if team.matches.length > 0}
                <table class="w-full text-sm">
                  <thead>
                    <tr class="bg-surface-page/60 text-xs tracking-wide text-text-muted uppercase">
                      <th class="px-5 py-2 text-left font-medium">Week</th>
                      <th class="px-5 py-2 text-left font-medium">Opponent</th>
                      <th class="px-5 py-2 text-center font-medium">Result</th>
                      <th class="px-5 py-2 text-center font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#each team.matches as match (match.matchId)}
                      <tr
                        class="border-t border-border-default/30 {match.result === 'TBD'
                          ? 'opacity-50'
                          : ''}"
                      >
                        <td class="px-5 py-2.5 text-xs whitespace-nowrap text-text-muted"
                          >{match.week}</td
                        >
                        <td class="px-5 py-2.5">
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
                        </td>
                        <td class="px-5 py-2.5 text-center">
                          <span
                            class="inline-block rounded border px-2 py-0.5 text-xs font-bold {resultChipClass(
                              match.result,
                            )}">{match.result}</span
                          >
                        </td>
                        <td
                          class="px-5 py-2.5 text-center font-mono text-xs {resultClass(
                            match.result,
                          )}">{match.score}</td
                        >
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {:else}
                <p class="px-5 py-4 text-sm text-text-muted">No matches scheduled yet.</p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
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
