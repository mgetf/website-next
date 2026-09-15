<script lang="ts" module>
  const WEEKDAY_FULL = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
  const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

  function padHour(hour: number): string {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function formatDurationMin(min: number): string {
    const rounded = Math.max(1, Math.round(min));
    if (rounded < 60) return `~${rounded} min`;
    const hours = Math.floor(rounded / 60);
    const minutes = rounded % 60;
    return minutes ? `~${hours}h ${minutes}m` : `~${hours}h`;
  }

  function formatGameCount(count: number): string {
    const rounded = Math.max(1, Math.round(count));
    return `${rounded} game${rounded === 1 ? '' : 's'}`;
  }
</script>

<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';

  let {
    grid,
    games,
    timeZoneLabel,
    peakWeekday,
    peakHour,
    typicalHours,
    medianDurationMin,
    medianGames,
    lastSeen,
  }: {
    grid: number[][];
    games: number;
    timeZoneLabel: string;
    peakWeekday: number | null;
    peakHour: number | null;
    typicalHours: { start: number; end: number } | null;
    medianDurationMin: number | null;
    medianGames: number | null;
    lastSeen: string;
  } = $props();

  const maxCell = $derived(Math.max(1, ...grid.flatMap((row) => row)));

  type HeatCell = { weekday: number; hour: number; count: number };
  let hover = $state<HeatCell | null>(null);

  const typicalLabel = $derived.by(() => {
    if (!typicalHours) return null;
    return `${padHour(typicalHours.start)}–${padHour(typicalHours.end)}`;
  });

  const sessionLabel = $derived.by(() => {
    const parts: string[] = [];
    if (medianDurationMin != null) parts.push(formatDurationMin(medianDurationMin));
    if (medianGames != null) parts.push(formatGameCount(medianGames));
    return parts.length > 0 ? parts.join(' · ') : null;
  });

  const peakWeekdayLabel = $derived(
    peakWeekday == null ? null : (WEEKDAY_FULL[peakWeekday] ?? null),
  );

  function cellCount(weekday: number, hour: number): number {
    return grid[weekday]?.[hour] ?? 0;
  }

  function cellFill(count: number): string | undefined {
    if (count <= 0) return undefined;
    const t = 0.22 + 0.78 * (count / maxCell);
    return `color-mix(in oklab, var(--color-primary-500) ${Math.round(t * 100)}%, transparent)`;
  }

  const shownHover = $derived.by(() => {
    if (!hover) return null;
    return {
      ...hover,
      count: cellCount(hover.weekday, hover.hour),
    };
  });
</script>

<Card padding="sm">
  {#snippet header()}
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold text-white">Activity</h3>
      <p class="text-xs text-text-muted">
        Hours in {timeZoneLabel} · last on a server {lastSeen}
      </p>
    </div>
  {/snippet}

  {#if games === 0}
    <p class="text-sm text-text-muted">No games in this window.</p>
  {:else}
    <div class="mb-4 grid grid-cols-3 gap-3">
      <div>
        <p class="text-xs text-text-muted">Busiest day</p>
        <p class="text-sm font-medium text-white">{peakWeekdayLabel ?? '—'}</p>
      </div>
      <div>
        <p class="text-xs text-text-muted">Usually on</p>
        <p class="text-sm font-medium text-white">{typicalLabel ?? '—'}</p>
      </div>
      <div>
        <p class="text-xs text-text-muted">Typical session</p>
        <p class="text-sm font-medium text-white">{sessionLabel ?? '—'}</p>
      </div>
    </div>
    <div class="overflow-x-auto">
      <div
        class="relative grid min-w-[36rem] gap-px"
        style="grid-template-columns: 2.25rem repeat(24, minmax(0, 1fr));"
      >
        <div></div>
        {#each HOURS as hour (hour)}
          <div class="pb-1 text-center text-[10px] text-text-muted">
            {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
          </div>
        {/each}
        {#each MON_FIRST as weekday (weekday)}
          <div class="pr-1 text-[10px] leading-4 text-text-muted">
            {WEEKDAY_SHORT[weekday]}
          </div>
          {#each HOURS as hour (`${weekday}-${hour}`)}
            {@const count = cellCount(weekday, hour)}
            {@const isPeak = peakWeekday === weekday && peakHour === hour}
            <button
              type="button"
              class="h-4 w-full rounded-[2px] {count <= 0 ? 'bg-surface-input' : ''} {isPeak
                ? 'ring-1 ring-success-500'
                : ''}"
              style:background-color={cellFill(count)}
              aria-label="{WEEKDAY_FULL[weekday]} {padHour(hour)}, {count} games"
              onpointerenter={() => (hover = { weekday, hour, count })}
              onpointerleave={() => (hover = null)}
              onfocus={() => (hover = { weekday, hour, count })}
              onblur={() => (hover = null)}
            ></button>
          {/each}
        {/each}
      </div>
    </div>
    {#if shownHover}
      <p class="mt-2 text-xs text-text-muted">
        <span class="font-medium text-white"
          >{WEEKDAY_FULL[shownHover.weekday]} {padHour(shownHover.hour)}</span
        >
        · {shownHover.count} game{shownHover.count === 1 ? '' : 's'}
        · {Math.round((shownHover.count / games) * 100)}%
      </p>
    {:else}
      <p class="mt-2 text-xs text-text-muted">Hover a square for that hour. Peak is outlined.</p>
    {/if}
  {/if}
</Card>
