<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import type { ProfilingScores } from '$lib/types/profiling';
  import { formatProfilingPercent, formatProfilingRaw } from '$lib/utils/profiling';

  let {
    name,
    steamId,
    x,
    y,
    status,
    scores,
    onClose,
  }: {
    name: string;
    steamId: string;
    x: number;
    y: number;
    status: 'loading' | 'ready' | 'error';
    scores: ProfilingScores | null;
    onClose: () => void;
  } = $props();

  let root = $state<HTMLElement | null>(null);

  function trackRoot(node: HTMLElement) {
    root = node;
    return () => {
      if (root === node) root = null;
    };
  }

  const left = $derived.by(() => {
    if (typeof window === 'undefined') return x;
    return Math.max(8, Math.min(x, window.innerWidth - 304));
  });
  const top = $derived.by(() => {
    if (typeof window === 'undefined') return y;
    return Math.max(8, Math.min(y, window.innerHeight - 24));
  });

  $effect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) return;
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

<div
  {@attach trackRoot}
  class="fixed z-50 w-72 max-w-[calc(100vw-1rem)]"
  style="left: {left}px; top: {top}px;"
  role="dialog"
  tabindex="-1"
  aria-label="Profiling snapshot for {name}"
  oncontextmenu={(event) => event.preventDefault()}
>
  <Card padding="sm" class="max-h-[min(32rem,calc(100vh-1rem))] overflow-y-auto shadow-lg">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold text-white">{name}</h2>
        <p class="truncate font-mono text-[10px] text-text-muted">{steamId}</p>
      </div>
      <Button href="/users/{steamId}?tab=profiling" variant="ghost" size="sm">Profile</Button>
    </div>

    {#if status === 'loading'}
      <p class="mt-3 text-sm text-text-muted">Loading snapshot…</p>
    {:else if status === 'error' || !scores}
      <p class="mt-3 text-sm text-danger-400">Could not load this player's profiling snapshot.</p>
    {:else}
      <div class="mt-3 rounded-lg border border-border-default bg-surface-input/60 px-3 py-2">
        <p class="text-[10px] font-medium uppercase tracking-wide text-text-muted">Evidence</p>
        <p class="text-2xl font-bold tabular-nums text-white">
          {formatProfilingPercent(scores.evidence)}
        </p>
        <p class="text-[11px] leading-snug text-text-muted">
          Skill discounted by uncertainty. Same scale for every account, not a division.
        </p>
      </div>

      <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt class="text-[10px] text-text-muted">Skill</dt>
          <dd class="text-sm font-semibold tabular-nums text-white">
            {formatProfilingPercent(scores.skill)}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] text-text-muted">Uncertainty</dt>
          <dd class="text-sm font-semibold tabular-nums text-white">
            {formatProfilingPercent(scores.skillUncertainty)}
          </dd>
        </div>
        <div>
          <dt class="text-[10px] text-text-muted">Trust</dt>
          <dd class="text-sm font-semibold tabular-nums text-white">
            {formatProfilingPercent(scores.trust)}
          </dd>
        </div>
      </dl>

      {#if scores.alts.length > 0}
        <div class="mt-3 flex flex-wrap gap-1">
          {#each scores.alts as alt (`${alt.label}-${alt.steam64 ?? alt.steamId}`)}
            <Badge color={alt.label === 'Linked' ? 'red' : 'yellow'}>
              {alt.label}
              {alt.name ?? alt.steam64 ?? alt.steamId}
            </Badge>
          {/each}
        </div>
      {/if}

      <ul class="mt-3 space-y-1.5">
        {#each scores.signals as signal (`${signal.axis}-${signal.id}`)}
          <li class="flex items-baseline justify-between gap-3 text-xs">
            <span class="min-w-0 text-text-body">
              {signal.label}
              {#if signal.missing}
                <span class="text-warning-400">missing</span>
              {/if}
            </span>
            <span class="shrink-0 font-mono tabular-nums text-text-label">
              {formatProfilingRaw(signal.raw)}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>
