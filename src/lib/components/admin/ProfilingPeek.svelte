<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import type { ProfilingSnapshot } from '$lib/types/profiling';
  import { formatRelativeTime } from '$lib/utils/profile';
  import {
    formatProfilingCount,
    formatProfilingHours,
    formatProfilingScore,
    formatSteamAgeYears,
    formatSteamCreatedAt,
    PROFILING_CARD_LOGOS,
  } from '$lib/utils/profiling';

  let {
    name,
    steamId,
    x,
    y,
    snapshot,
    status,
    onClose,
  }: {
    name: string;
    steamId: string;
    x: number;
    y: number;
    snapshot: ProfilingSnapshot | null;
    status: 'loading' | 'ready' | 'error';
    onClose: () => void;
  } = $props();

  const PEEK_WIDTH = 384;
  const PEEK_MARGIN = 8;

  let root = $state<HTMLElement | null>(null);

  function trackRoot(node: HTMLElement) {
    root = node;
    return () => {
      if (root === node) root = null;
    };
  }

  const position = $derived.by(() => {
    if (typeof window === 'undefined') {
      return { left: x, top: y, maxHeight: 512 };
    }
    const left = Math.max(PEEK_MARGIN, Math.min(x, window.innerWidth - PEEK_WIDTH - PEEK_MARGIN));
    const maxHeight = Math.min(512, window.innerHeight - PEEK_MARGIN * 2);
    let top = y;
    if (top + 240 > window.innerHeight - PEEK_MARGIN) {
      top = Math.max(PEEK_MARGIN, window.innerHeight - maxHeight - PEEK_MARGIN);
    }
    return { left, top, maxHeight: window.innerHeight - top - PEEK_MARGIN };
  });

  const steamRows = $derived.by(() => {
    if (!snapshot) return [];
    const rows: { label: string; value: string }[] = [];
    if (snapshot.steamAgeYears != null) {
      rows.push({ label: 'Account age', value: formatSteamAgeYears(snapshot.steamAgeYears) });
    }
    if (snapshot.steamCreatedAt) {
      rows.push({ label: 'Created', value: formatSteamCreatedAt(snapshot.steamCreatedAt) });
    }
    if (snapshot.steamLevel != null) {
      rows.push({ label: 'Steam level', value: formatProfilingCount(snapshot.steamLevel) });
    }
    if (snapshot.gameCount != null) {
      rows.push({ label: 'Games', value: formatProfilingCount(snapshot.gameCount) });
    }
    return rows;
  });

  const scoreRows = $derived.by(() => {
    if (!snapshot) return [];
    return [
      ...snapshot.scores
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((row) => ({
          key: `region-${row.region}`,
          label: row.region.toUpperCase(),
          value: formatProfilingScore(row.score),
        })),
      ...snapshot.classScores
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((row) => ({
          key: `class-${row.classId}-${row.region}`,
          label: row.className,
          value: formatProfilingScore(row.score),
        })),
    ];
  });

  const hasFacts = $derived(
    snapshot != null &&
      (snapshot.tf2Hours != null ||
        steamRows.length > 0 ||
        scoreRows.length > 0 ||
        snapshot.logsTfCount != null ||
        snapshot.mgeServerHours != null),
  );

  function onPointerDown(event: PointerEvent) {
    if (event.button === 2) return;
    if (root && event.target instanceof Node && root.contains(event.target)) return;
    onClose();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onClose();
  }
</script>

<svelte:window onpointerdown={onPointerDown} onkeydown={onKeydown} />

<div
  {@attach trackRoot}
  class="fixed z-50 w-96 max-w-[calc(100vw-1rem)]"
  style="left: {position.left}px; top: {position.top}px; max-height: {position.maxHeight}px"
  role="dialog"
  tabindex="-1"
  aria-label="Profiling details for {name}"
  oncontextmenu={(event) => event.preventDefault()}
>
  <Card padding="sm" class="max-h-full overflow-y-auto shadow-lg">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold text-white">{name}</h2>
        <p class="truncate font-mono text-[10px] text-text-muted">{steamId}</p>
      </div>
      <Button href="/users/{steamId}?tab=profiling" variant="ghost" size="sm">Profile</Button>
    </div>

    {#if status === 'loading'}
      <p class="mt-3 text-sm text-text-muted">Loading snapshot…</p>
    {:else if status === 'error' && !snapshot}
      <p class="mt-3 text-sm text-danger-400">Could not load this player's profiling snapshot.</p>
    {:else if !hasFacts}
      <p class="mt-3 text-sm text-text-muted">No profiling numbers for this player yet.</p>
    {:else if snapshot}
      <div class="mt-3 space-y-3">
        {#if snapshot.tf2Hours != null}
          <div class="flex items-baseline justify-between gap-3 text-xs">
            <span class="inline-flex items-center gap-1.5 text-text-body">
              <img src={PROFILING_CARD_LOGOS.tf2} alt="" class="h-3.5 w-3.5 object-contain" />
              Hours in TF2
            </span>
            <span class="shrink-0 font-semibold tabular-nums text-white">
              {formatProfilingHours(snapshot.tf2Hours)}
            </span>
          </div>
        {/if}

        {#if steamRows.length > 0 || snapshot.profilePublic === false}
          <section>
            <div class="mb-1.5 flex items-center gap-1.5">
              <img
                src={PROFILING_CARD_LOGOS.steam}
                alt=""
                class="h-3.5 w-3.5 brightness-0 invert"
              />
              <h3 class="text-[10px] font-medium uppercase tracking-wide text-text-muted">Steam</h3>
            </div>
            <dl class="space-y-1">
              {#each steamRows as row (row.label)}
                <div class="flex items-baseline justify-between gap-3 text-xs">
                  <dt class="text-text-body">{row.label}</dt>
                  <dd class="shrink-0 font-semibold tabular-nums text-white">{row.value}</dd>
                </div>
              {/each}
            </dl>
            {#if snapshot.profilePublic === false}
              <p class="mt-1.5 text-xs text-warning-400">Steam profile is private</p>
            {/if}
          </section>
        {/if}

        {#if scoreRows.length > 0}
          <section>
            <h3 class="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Score
            </h3>
            <ul class="space-y-1">
              {#each scoreRows as row (row.key)}
                <li class="flex items-baseline justify-between gap-3 text-xs">
                  <span class="text-text-body">{row.label}</span>
                  <span class="shrink-0 font-semibold tabular-nums text-white">{row.value}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        {#if snapshot.logsTfCount != null || snapshot.mgeServerHours != null}
          <section>
            <h3 class="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
              Activity
            </h3>
            <dl class="space-y-1">
              {#if snapshot.logsTfCount != null}
                <div class="flex items-baseline justify-between gap-3 text-xs">
                  <dt class="inline-flex items-center gap-1.5 text-text-body">
                    <img
                      src={PROFILING_CARD_LOGOS.logs}
                      alt=""
                      class="h-3.5 w-3.5 object-contain"
                    />
                    logs.tf
                  </dt>
                  <dd class="shrink-0 font-semibold tabular-nums text-white">
                    {formatProfilingCount(snapshot.logsTfCount)}
                  </dd>
                </div>
              {/if}
              {#if snapshot.mgeServerHours != null}
                <div class="flex items-baseline justify-between gap-3 text-xs">
                  <dt class="inline-flex items-center gap-1.5 text-text-body">
                    <img src={PROFILING_CARD_LOGOS.mge} alt="" class="h-3.5 w-3.5 object-contain" />
                    Hours on mge.tf
                  </dt>
                  <dd class="shrink-0 font-semibold tabular-nums text-white">
                    {formatProfilingHours(snapshot.mgeServerHours)}
                  </dd>
                </div>
              {/if}
            </dl>
          </section>
        {/if}
      </div>
    {/if}

    {#if snapshot?.cachedAt}
      <p class="mt-3 text-[10px] text-text-muted">Cached {formatRelativeTime(snapshot.cachedAt)}</p>
    {/if}
  </Card>
</div>
