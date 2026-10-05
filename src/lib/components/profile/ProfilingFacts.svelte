<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import type { ProfilingSnapshot } from '$lib/types/profiling';
  import {
    formatProfilingCount,
    formatProfilingHours,
    formatProfilingScore,
    formatSteamAgeYears,
    formatSteamCreatedAt,
    headlineScore,
    remainingScoreLabels,
  } from '$lib/utils/profiling';

  let {
    snapshot,
    compact = false,
  }: {
    snapshot: ProfilingSnapshot;
    compact?: boolean;
  } = $props();

  const topScore = $derived(headlineScore(snapshot));
  const scoreDetails = $derived(remainingScoreLabels(snapshot));
  const valueClass = $derived(
    compact
      ? 'text-xl font-bold tabular-nums text-white'
      : 'text-3xl font-bold tabular-nums text-white',
  );
  const labelClass = $derived(compact ? 'text-[11px] text-text-muted' : 'text-xs text-text-muted');
</script>

{#snippet stat(label: string, value: string)}
  <div>
    <p class={labelClass}>{label}</p>
    <p class="font-semibold tabular-nums text-white">{value}</p>
  </div>
{/snippet}

<div class={compact ? 'grid gap-3 sm:grid-cols-3' : 'grid gap-3 lg:grid-cols-3'}>
  <Card padding={compact ? 'sm' : 'md'}>
    <p class={labelClass}>Steam</p>
    <p class={valueClass}>{formatProfilingHours(snapshot.tf2Hours)}</p>
    <p class="text-xs text-text-body">hours in TF2</p>
    <div class="mt-3 grid grid-cols-2 gap-2">
      {@render stat('Account age', formatSteamAgeYears(snapshot.steamAgeYears))}
      {@render stat('Created', formatSteamCreatedAt(snapshot.steamCreatedAt))}
      {@render stat('Steam level', formatProfilingCount(snapshot.steamLevel))}
      {@render stat('Games', formatProfilingCount(snapshot.gameCount))}
    </div>
    {#if snapshot.profilePublic === false}
      <p class="mt-3 text-xs text-warning-400">Steam profile is private</p>
    {/if}
  </Card>

  <Card padding={compact ? 'sm' : 'md'}>
    <p class={labelClass}>Score</p>
    <p class={valueClass}>{formatProfilingScore(topScore)}</p>
    <p class="text-xs text-text-body">highest class or region score</p>
    {#if scoreDetails.length > 0}
      <p class="mt-3 text-xs leading-relaxed text-text-label">
        {scoreDetails.join(' · ')}
      </p>
    {/if}
  </Card>

  <Card padding={compact ? 'sm' : 'md'}>
    <p class={labelClass}>Activity</p>
    <div class="mt-1 grid grid-cols-2 gap-3">
      <div>
        <p class={valueClass}>{formatProfilingCount(snapshot.logsTfCount)}</p>
        <p class="text-xs text-text-body">logs.tf</p>
      </div>
      <div>
        <p class={valueClass}>{formatProfilingHours(snapshot.mgeServerHours)}</p>
        <p class="text-xs text-text-body">hours on mge.tf</p>
      </div>
    </div>
  </Card>
</div>
