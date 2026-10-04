<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import type { ProfilingScores } from '$lib/types/profiling';
  import { formatProfilingPercent } from '$lib/utils/profiling';

  let { scores, steam64 }: { scores: ProfilingScores; steam64: string | null } = $props();

  const missingCount = $derived(scores.signals.filter((signal) => signal.missing).length);
</script>

<Card padding="sm">
  {#snippet header()}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-semibold text-white">Profiling</h2>
      {#if steam64}
        <a class="text-sm text-primary-400 hover:underline" href="/users/{steam64}?tab=profiling">
          Open full profile
        </a>
      {/if}
    </div>
  {/snippet}

  <p class="mb-4 text-sm text-text-body">
    Coefficients for staff. Skill is evidence, not a recommended division.
  </p>

  <div class="mb-3">
    <p class="text-xs text-text-muted">Evidence</p>
    <p class="text-2xl font-semibold tabular-nums text-white">
      {formatProfilingPercent(scores.evidence)}
    </p>
    <p class="text-xs text-text-muted">Skill discounted by uncertainty. Not a division.</p>
  </div>

  <div class="grid gap-3 sm:grid-cols-3">
    <div>
      <p class="text-xs text-text-muted">Account trust</p>
      <p class="text-xl font-semibold tabular-nums text-white">
        {formatProfilingPercent(scores.trust)}
      </p>
    </div>
    <div>
      <p class="text-xs text-text-muted">Skill evidence</p>
      <p class="text-xl font-semibold tabular-nums text-white">
        {formatProfilingPercent(scores.skill)}
      </p>
    </div>
    <div>
      <p class="text-xs text-text-muted">Skill uncertainty</p>
      <p class="text-xl font-semibold tabular-nums text-white">
        {formatProfilingPercent(scores.skillUncertainty)}
      </p>
    </div>
  </div>

  <div class="mt-4 flex flex-wrap items-center gap-2">
    {#if missingCount > 0}
      <Badge color="yellow">{missingCount} missing signal{missingCount === 1 ? '' : 's'}</Badge>
    {/if}
    {#if scores.alts.length > 0}
      <Badge color="red"
        >{scores.alts.length} alt{scores.alts.length === 1 ? '' : 's'} in cluster</Badge
      >
    {/if}
  </div>
</Card>
