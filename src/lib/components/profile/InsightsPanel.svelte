<script lang="ts">
  import { resolve } from '$app/paths';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import { classIcon } from '$lib/utils/classIcons';
  import { flagForRegion } from '$lib/utils/regions';
  import type { MgeRating, PlatformRegion } from '$lib/types/mge';
  import type { PlayerServerStats, StatsWindow } from '$lib/types/profile';
  import { STATS_WINDOWS } from '$lib/types/profile';
  import {
    chartPointsFromSeries,
    formatDuration,
    formatRelativeTime,
    resultClass,
  } from '$lib/utils/profile';
  import ActivityHeatmap from './ActivityHeatmap.svelte';
  import RatingTrend from './RatingTrend.svelte';

  let {
    steamId,
    ratings,
    regions,
    preview,
  }: {
    steamId: string;
    ratings: MgeRating[];
    regions: PlatformRegion[];
    preview?: (args: { region: string; days: StatsWindow }) => PlayerServerStats | null;
  } = $props();

  let statsWindow = $state<StatsWindow>('all');
  let pickedRegion = $state<string | null>(null);
  let stats = $state<PlayerServerStats | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);

  const regionOptions = $derived(
    ratings.length > 0 ? ratings : regions.map((row) => ({ region: row.code })),
  );

  const region = $derived.by(() => {
    if (pickedRegion && regionOptions.some((row) => row.region === pickedRegion))
      return pickedRegion;
    return regionOptions[0]?.region ?? '';
  });

  $effect(() => {
    if (!region) {
      stats = null;
      loading = false;
      loadError = null;
      return;
    }
    if (preview) {
      stats = preview({ region, days: statsWindow });
      loading = false;
      loadError = stats ? null : 'Could not load server stats for this region.';
      return;
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams({
      region,
      days: String(statsWindow),
      tz,
    });
    const requestRegion = region;
    const requestWindow = statsWindow;
    let cancelled = false;
    loading = true;
    loadError = null;
    void fetch(`/api/users/${encodeURIComponent(steamId)}/server-stats?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load server stats');
        return (await res.json()) as PlayerServerStats;
      })
      .then((payload) => {
        if (cancelled) return;
        if (requestRegion !== region || requestWindow !== statsWindow) return;
        stats = payload;
        loading = false;
      })
      .catch(() => {
        if (cancelled) return;
        stats = null;
        loading = false;
        loadError = 'Could not load server stats for this region.';
      });
    return () => {
      cancelled = true;
    };
  });

  const series = $derived(stats ? chartPointsFromSeries(stats.rating.series) : []);
  const peak = $derived.by(() => {
    const first = series[0];
    if (!first) return null;
    return series.reduce((best, point) => (point.value > best.value ? point : best), first);
  });
  const heatmap = $derived(
    stats?.activity.byWeekdayHour ?? Array.from({ length: 7 }, () => new Array(24).fill(0)),
  );
  const arenas = $derived(stats?.arenas ?? []);
  const classes = $derived(stats?.classes ?? []);
  const foes = $derived(stats?.foes ?? []);
  const rivals = $derived(stats?.rivals);
  const maxArenaMatches = $derived(Math.max(1, ...arenas.map((row) => row.matches)));
  const maxClassMatches = $derived(Math.max(1, ...classes.map((row) => row.matches)));

  const timeZoneLabel = $derived.by(() => {
    const tz = stats?.activity.timeZone ?? 'UTC';
    if (tz === 'UTC') return 'UTC';
    return (tz.split('/').pop() ?? tz).replaceAll('_', ' ');
  });

  const duelColumns: Column[] = [
    { key: 'when', label: 'When' },
    { key: 'opponent', label: 'Opponent' },
    { key: 'result', label: 'Result' },
    { key: 'score', label: 'Score' },
    { key: 'className', label: 'Class' },
    { key: 'arena', label: 'Arena' },
    { key: 'duration', label: 'Duration' },
  ];

  const doubleColumns: Column[] = [
    { key: 'when', label: 'When' },
    { key: 'partner', label: 'Partner' },
    { key: 'opponents', label: 'Opponents' },
    { key: 'result', label: 'Result' },
    { key: 'score', label: 'Score' },
    { key: 'className', label: 'Class' },
    { key: 'arena', label: 'Arena' },
    { key: 'duration', label: 'Duration' },
  ];
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h2 class="text-sm font-semibold text-white">Server stats</h2>
    <div
      class="flex overflow-hidden rounded-lg border border-border-input"
      role="group"
      aria-label="Stats window"
    >
      {#each STATS_WINDOWS as chip (chip.label)}
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium transition-colors {statsWindow === chip.id
            ? 'bg-primary-700 text-white'
            : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
          aria-pressed={statsWindow === chip.id}
          onclick={() => (statsWindow = chip.id)}
        >
          {chip.label}
        </button>
      {/each}
    </div>
  </div>

  {#if !region}
    <p class="text-sm text-text-muted">No server region to load stats from.</p>
  {:else if loadError}
    <p class="text-sm text-danger-400">{loadError}</p>
  {:else if loading && !stats}
    <p class="text-sm text-text-muted">Loading server stats…</p>
  {:else}
    <Card padding="none">
      {#snippet header()}
        <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <h3 class="text-sm font-semibold text-white">Rating over time</h3>
            {#if peak}
              <p class="text-xs text-text-muted">
                Peak <span class="font-medium text-success-400">{peak.value}</span>
                · {peak.label}
              </p>
            {/if}
          </div>
          {#if regionOptions.length > 1}
            <div class="flex flex-wrap gap-1" role="group" aria-label="Rating region">
              {#each regionOptions as option (option.region)}
                {@const flagCode = flagForRegion(option.region, regions)}
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors {region ===
                  option.region
                    ? 'border-primary-500 bg-primary-500/15 text-white'
                    : 'border-border-input bg-surface-input text-text-body hover:bg-surface-hover'}"
                  aria-pressed={region === option.region}
                  onclick={() => (pickedRegion = option.region)}
                >
                  <FlagIcon code={flagCode} class="h-3 w-4 rounded-sm" />
                  {option.region.toUpperCase()}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}
      <div class="px-1 pb-2">
        {#if series.length === 0}
          <p class="py-8 text-center text-sm text-text-muted">No rating history for this player.</p>
        {:else}
          <RatingTrend points={series} />
        {/if}
      </div>
    </Card>

    <ActivityHeatmap
      grid={heatmap}
      games={stats?.activity.games ?? 0}
      {timeZoneLabel}
      peakWeekday={stats?.activity.peakWeekday ?? null}
      peakHour={stats?.activity.peakHour ?? null}
      typicalHours={stats?.activity.typicalHours ?? null}
      medianDurationMin={stats?.activity.sessions.medianDurationMin ?? null}
      medianGames={stats?.activity.sessions.medianGames ?? null}
      lastSeen={formatRelativeTime(stats?.activity.lastSeen)}
    />

    <div class="grid gap-3 md:grid-cols-2">
      <Card padding="sm">
        <h3 class="mb-3 text-sm font-semibold text-white">Most-played arenas</h3>
        {#if arenas.length === 0}
          <p class="text-sm text-text-muted">No games in this window.</p>
        {:else}
          <ul class="flex flex-col gap-3">
            {#each arenas as row (row.name)}
              <li class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="font-medium text-white">{row.name}</span>
                  <span class="text-text-muted">{row.matches} games</span>
                </div>
                <div class="flex h-1.5 overflow-hidden rounded-full bg-surface-input">
                  <div
                    class="h-full bg-success-500"
                    style:width="{(row.wins / maxArenaMatches) * 100}%"
                  ></div>
                  <div
                    class="h-full bg-danger-500"
                    style:width="{(row.losses / maxArenaMatches) * 100}%"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>

      <Card padding="sm">
        <h3 class="mb-3 text-sm font-semibold text-white">Classes played</h3>
        {#if classes.length === 0}
          <p class="text-sm text-text-muted">No class data in this window.</p>
        {:else}
          <ul class="flex flex-col gap-3">
            {#each classes as row (row.classId)}
              {@const icon = classIcon(row.name)}
              <li class="flex flex-col gap-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="flex min-w-0 items-center gap-2 font-medium text-white">
                    {#if icon}
                      <img src={icon} alt="" class="size-5 shrink-0" />
                    {/if}
                    {row.name}
                  </span>
                  <span class="text-text-muted">{row.matches} games</span>
                </div>
                <div class="flex h-1.5 overflow-hidden rounded-full bg-surface-input">
                  <div
                    class="h-full bg-success-500"
                    style:width="{(row.wins / maxClassMatches) * 100}%"
                  ></div>
                  <div
                    class="h-full bg-danger-500"
                    style:width="{(row.losses / maxClassMatches) * 100}%"
                  ></div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <Card padding="sm">
        <h3 class="mb-3 text-sm font-semibold text-white">Top foes</h3>
        {#if foes.length === 0}
          <p class="text-sm text-text-muted">No opponents in this window.</p>
        {:else}
          <ul class="flex flex-col gap-3">
            {#each foes as foe (foe.steamId)}
              <li class="flex items-center gap-3">
                <img src={foe.avatar} alt="" class="size-10 shrink-0 rounded-full" />
                {#if foe.steam64}
                  <a
                    href={resolve('/users/[steamId]', { steamId: foe.steam64 })}
                    class="min-w-0 flex-1 truncate text-sm font-medium text-white hover:text-primary-400"
                    >{foe.name}</a
                  >
                {:else}
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-white"
                    >{foe.name}</span
                  >
                {/if}
                <span class="shrink-0 text-xs text-text-muted">
                  <span class="text-success-400">{foe.wins}W</span>
                  ·
                  <span class="text-danger-400">{foe.losses}L</span>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>

      <Card padding="sm">
        <h3 class="mb-3 text-sm font-semibold text-white">Rivals</h3>
        {#if !rivals?.nemesis && !rivals?.dominated && !rivals?.frequent}
          <p class="text-sm text-text-muted">No rivals in this window.</p>
        {:else}
          <ul class="flex flex-col gap-3">
            {#if rivals.nemesis}
              <li class="flex items-center gap-3">
                <img src={rivals.nemesis.avatar} alt="" class="size-10 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-muted">Nemesis</p>
                  <p class="truncate text-sm font-medium text-white">{rivals.nemesis.name}</p>
                  <p class="text-xs text-text-muted">
                    <span class="text-success-400">{rivals.nemesis.wins}W</span>
                    ·
                    <span class="text-danger-400">{rivals.nemesis.losses}L</span>
                    · last {formatRelativeTime(rivals.nemesis.lastAt)}
                  </p>
                </div>
                <span class="shrink-0 text-xs text-danger-400">{rivals.nemesis.losses} losses</span>
              </li>
            {/if}
            {#if rivals.dominated}
              <li class="flex items-center gap-3">
                <img src={rivals.dominated.avatar} alt="" class="size-10 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-muted">Most dominated</p>
                  <p class="truncate text-sm font-medium text-white">{rivals.dominated.name}</p>
                  <p class="text-xs text-text-muted">
                    <span class="text-success-400">{rivals.dominated.wins}W</span>
                    ·
                    <span class="text-danger-400">{rivals.dominated.losses}L</span>
                    · last {formatRelativeTime(rivals.dominated.lastAt)}
                  </p>
                </div>
                <span class="shrink-0 text-xs text-success-400">{rivals.dominated.wins} wins</span>
              </li>
            {/if}
            {#if rivals.frequent}
              <li class="flex items-center gap-3">
                <img src={rivals.frequent.avatar} alt="" class="size-10 shrink-0 rounded-full" />
                <div class="min-w-0 flex-1">
                  <p class="text-xs text-text-muted">Most dueled</p>
                  <p class="truncate text-sm font-medium text-white">{rivals.frequent.name}</p>
                  <p class="text-xs text-text-muted">
                    <span class="text-success-400">{rivals.frequent.wins}W</span>
                    ·
                    <span class="text-danger-400">{rivals.frequent.losses}L</span>
                    · last {formatRelativeTime(rivals.frequent.lastAt)}
                  </p>
                </div>
                <span class="shrink-0 text-xs text-text-muted">{rivals.frequent.matches} games</span
                >
              </li>
            {/if}
          </ul>
        {/if}
      </Card>
    </div>

    <div>
      <h3 class="mb-3 text-sm font-semibold text-white">Recent duels</h3>
      <DataTable
        data={stats?.recentDuels ?? []}
        columns={duelColumns}
        compact
        emptyMessage="No recent duels."
      >
        {#snippet cell(row, col)}
          {#if col.key === 'when'}
            <span class="text-sm text-text-muted">{formatRelativeTime(row.at)}</span>
          {:else if col.key === 'opponent'}
            {#if row.opponentSteam64}
              <a
                href={resolve('/users/[steamId]', { steamId: row.opponentSteam64 })}
                class="inline-flex items-center gap-2 text-sm font-medium text-white hover:text-primary-400"
              >
                <img src={row.opponentAvatar} alt="" class="size-5 rounded-full" />
                {row.opponentName}
              </a>
            {:else}
              <span class="text-sm font-medium text-white">{row.opponentName}</span>
            {/if}
          {:else if col.key === 'result'}
            <span class="font-semibold {resultClass(row.result)}">{row.result}</span>
          {:else if col.key === 'score'}
            <span class="text-sm tabular-nums text-text-label">{row.score}</span>
          {:else if col.key === 'className'}
            {@const icon = classIcon(row.className)}
            {#if icon}
              <img src={icon} alt={row.className} class="size-4" />
            {:else}
              <span class="text-sm text-text-muted">{row.className || '—'}</span>
            {/if}
          {:else if col.key === 'arena'}
            <span class="text-sm text-text-body">{row.arena}</span>
          {:else if col.key === 'duration'}
            <span class="text-sm tabular-nums text-text-muted"
              >{formatDuration(row.durationSec)}</span
            >
          {/if}
        {/snippet}
      </DataTable>
    </div>

    <div>
      <h3 class="mb-3 text-sm font-semibold text-white">Recent double duels</h3>
      <DataTable
        data={stats?.recentDoubles ?? []}
        columns={doubleColumns}
        compact
        emptyMessage="No recent 2v2 duels."
      >
        {#snippet cell(row, col)}
          {#if col.key === 'when'}
            <span class="text-sm text-text-muted">{formatRelativeTime(row.at)}</span>
          {:else if col.key === 'partner'}
            <span class="text-sm font-medium text-white">{row.partnerName}</span>
          {:else if col.key === 'opponents'}
            <span class="text-sm text-text-body"
              >{row.opponents.map((o) => o.name).join(' + ')}</span
            >
          {:else if col.key === 'result'}
            <span class="font-semibold {resultClass(row.result)}">{row.result}</span>
          {:else if col.key === 'score'}
            <span class="text-sm tabular-nums text-text-label">{row.score}</span>
          {:else if col.key === 'className'}
            {@const icon = classIcon(row.className)}
            {#if icon}
              <img src={icon} alt={row.className} class="size-4" />
            {:else}
              <span class="text-sm text-text-muted">{row.className || '—'}</span>
            {/if}
          {:else if col.key === 'arena'}
            <span class="text-sm text-text-body">{row.arena}</span>
          {:else if col.key === 'duration'}
            <span class="text-sm tabular-nums text-text-muted"
              >{formatDuration(row.durationSec)}</span
            >
          {/if}
        {/snippet}
      </DataTable>
    </div>
  {/if}
</div>
