<script lang="ts">
  import type { ProfilingSnapshot } from '$lib/types/profiling';
  import { formatRelativeTime } from '$lib/utils/profile';
  import { emptyProfilingSnapshot, profilingCardChips } from '$lib/utils/profiling';

  let {
    snapshot,
    status: _status,
  }: {
    snapshot: ProfilingSnapshot | null;
    status: 'loading' | 'ready' | 'error';
  } = $props();

  const chips = $derived(profilingCardChips(snapshot ?? emptyProfilingSnapshot()));
  const cacheTitle = $derived(
    snapshot?.cachedAt ? `Cached ${formatRelativeTime(snapshot.cachedAt)}` : undefined,
  );
</script>

<div class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5" title={cacheTitle}>
  {#each chips as chip (chip.key)}
    {#if chip.key === 'score'}
      <span class="text-[11px] leading-tight text-text-muted" aria-hidden="true">·</span>
    {/if}
    <span class="inline-flex min-w-0 items-center gap-0.5" title={chip.label}>
      {#if chip.logo}
        <img
          src={chip.logo}
          alt=""
          class="h-3 w-3 shrink-0 object-contain {chip.invert ? 'brightness-0 invert' : ''}"
        />
      {/if}
      <span class="truncate text-[11px] leading-tight tabular-nums text-text-label"
        >{chip.value}</span
      >
    </span>
  {/each}
</div>
