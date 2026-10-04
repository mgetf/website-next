<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import type { ProfileSignal, ProfilingScores } from '$lib/types/profiling';
  import { formatProfilingPercent, formatProfilingRaw } from '$lib/utils/profiling';

  let { scores }: { scores: ProfilingScores } = $props();

  const columns: Column[] = [
    { key: 'signal', label: 'Signal' },
    { key: 'raw', label: 'Raw' },
    { key: 'normalized', label: 'Normalized', align: 'right' },
    { key: 'contribution', label: 'Contribution', align: 'right' },
    { key: 'status', label: 'Status', align: 'right' },
  ];

  const trustSignals = $derived(scores.signals.filter((signal) => signal.axis === 'trust'));
  const skillSignals = $derived(scores.signals.filter((signal) => signal.axis === 'skill'));

  function barClass(kind: 'trust' | 'skill' | 'uncertainty'): string {
    if (kind === 'trust') return 'bg-success-500';
    if (kind === 'skill') return 'bg-primary-500';
    return 'bg-warning-500';
  }
</script>

{#snippet meter(
  label: string,
  value: number,
  kind: 'trust' | 'skill' | 'uncertainty',
  hint: string,
)}
  <div class="rounded-lg border border-border-default bg-surface-input/50 px-3 py-2">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-xs font-medium text-text-label">{label}</p>
      <p class="text-lg font-bold tabular-nums text-white">{formatProfilingPercent(value)}</p>
    </div>
    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-input">
      <div
        class="h-full rounded-full {barClass(kind)}"
        style="width: {Math.round(value * 100)}%"
      ></div>
    </div>
    <p class="mt-1 text-[11px] leading-snug text-text-muted">{hint}</p>
  </div>
{/snippet}

{#snippet signalTable(rows: ProfileSignal[])}
  <DataTable data={rows} {columns} dense emptyMessage="No signals">
    {#snippet cell(row: ProfileSignal, col)}
      {#if col.key === 'signal'}
        <p class="font-medium text-white">
          {row.label}
          {#if row.note}
            <span class="font-normal text-text-muted">· {row.note}</span>
          {/if}
        </p>
      {:else if col.key === 'raw'}
        <span class="font-mono text-sm text-text-body">{formatProfilingRaw(row.raw)}</span>
      {:else if col.key === 'normalized'}
        <span class="tabular-nums text-text-body">
          {row.normalized == null ? '—' : formatProfilingPercent(row.normalized)}
        </span>
      {:else if col.key === 'contribution'}
        <span class="tabular-nums text-text-body">{formatProfilingPercent(row.contribution)}</span>
      {:else}
        {#if row.missing}
          <Badge color="yellow">Missing</Badge>
        {:else}
          <Badge color="green">Used</Badge>
        {/if}
      {/if}
    {/snippet}
  </DataTable>
{/snippet}

<div class="space-y-3">
  <div>
    <h2 class="text-lg font-semibold text-white">Profiling</h2>
    <p class="text-sm text-text-body">
      Staff-only coefficients. Skill is evidence of high-level play in this mix of signals, not a
      recommended division.
    </p>
  </div>

  <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    {@render meter(
      'Evidence',
      scores.evidence,
      'skill',
      'Skill discounted by uncertainty. Not a division.',
    )}
    {@render meter(
      'Account trust',
      scores.trust,
      'trust',
      'How stable and credible this Steam account looks.',
    )}
    {@render meter(
      'Skill evidence',
      scores.skill,
      'skill',
      'How much evidence there is of high-level play. Staff still place by hand.',
    )}
    {@render meter(
      'Skill uncertainty',
      scores.skillUncertainty,
      'uncertainty',
      'How thin the skill evidence is (missing data, provisional ELO, few logs).',
    )}
  </div>

  {#if scores.alts.length > 0}
    <Card padding="sm">
      {#snippet header()}
        <h3 class="text-sm font-semibold text-white">Alt cluster</h3>
      {/snippet}
      <p class="mb-2 text-xs text-text-body">
        Scores are not merged across accounts. Trust is reduced; inspect the other Steam IDs
        separately.
      </p>
      <ul class="space-y-1">
        {#each scores.alts as alt (`${alt.label}-${alt.steam64 ?? alt.steamId}`)}
          <li class="flex flex-wrap items-center gap-2">
            <Badge color={alt.label === 'Linked' ? 'red' : 'yellow'}>{alt.label}</Badge>
            {#if alt.steam64}
              <a
                class="font-mono text-sm text-primary-400 hover:underline"
                href="/users/{alt.steam64}"
              >
                {alt.name ?? alt.steam64}
              </a>
            {:else}
              <span class="font-mono text-sm text-text-body">{alt.name ?? alt.steamId}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </Card>
  {/if}

  <Card padding="none">
    {#snippet header()}
      <h3 class="px-3 py-2 text-sm font-semibold text-white">Trust signals</h3>
    {/snippet}
    {@render signalTable(trustSignals)}
  </Card>

  <Card padding="none">
    {#snippet header()}
      <h3 class="px-3 py-2 text-sm font-semibold text-white">Skill signals</h3>
    {/snippet}
    {@render signalTable(skillSignals)}
  </Card>
</div>
