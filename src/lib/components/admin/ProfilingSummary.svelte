<script lang="ts">
  import ProfilingFacts from '$lib/components/profile/ProfilingFacts.svelte';
  import ProfilingRefresh from '$lib/components/admin/ProfilingRefresh.svelte';
  import type { ProfilingSnapshot } from '$lib/types/profiling';

  let { snapshot, steam64 }: { snapshot: ProfilingSnapshot; steam64: string | null } = $props();
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-base font-semibold text-white">Profiling</h2>
    <div class="flex flex-wrap items-center gap-3">
      {#if steam64}
        <ProfilingRefresh steamId={steam64} cachedAt={snapshot.cachedAt} />
        <a class="text-sm text-primary-400 hover:underline" href="/users/{steam64}?tab=profiling">
          Open full profile
        </a>
      {/if}
    </div>
  </div>
  <ProfilingFacts {snapshot} compact />
</div>
