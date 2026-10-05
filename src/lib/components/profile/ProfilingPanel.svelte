<script lang="ts">
  import ProfilingFacts from '$lib/components/profile/ProfilingFacts.svelte';
  import ProfilingRefresh from '$lib/components/admin/ProfilingRefresh.svelte';
  import type { ProfilingSnapshot } from '$lib/types/profiling';

  let { snapshot, steamId }: { snapshot: ProfilingSnapshot; steamId: string } = $props();
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-lg font-semibold text-white">Profiling</h2>
      <p class="text-sm text-text-body">
        Hard numbers from Steam, logs.tf, and mge.tf servers, in one place.
      </p>
    </div>
    <ProfilingRefresh {steamId} cachedAt={snapshot.cachedAt} />
  </div>
  <ProfilingFacts {snapshot} />
</div>
