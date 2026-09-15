<script lang="ts">
  import type { Snippet } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';

  let { regionPicker }: { regionPicker?: Snippet } = $props();

  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const weekdays = Array.from({ length: 7 }, (_, day) => day);
  const barRows = [92, 78, 64, 51, 38];
  const tableRows = Array.from({ length: 6 }, (_, row) => row);
</script>

<div class="flex flex-col gap-3" aria-hidden="true">
  <Card padding="none">
    {#snippet header()}
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h3 class="text-sm font-semibold text-white">Rating over time</h3>
          <Skeleton class="mt-1 h-3 w-36" />
        </div>
        {#if regionPicker}
          {@render regionPicker()}
        {/if}
      </div>
    {/snippet}
    <div class="px-5 pb-4 pt-2">
      <Skeleton class="h-60 w-full" />
    </div>
  </Card>

  <Card padding="sm">
    {#snippet header()}
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-sm font-semibold text-white">Activity</h3>
        <Skeleton class="h-3 w-48" />
      </div>
    {/snippet}
    <div class="mb-4 grid grid-cols-3 gap-3">
      {#each ['Busiest day', 'Usually on', 'Typical session'] as label (label)}
        <div>
          <p class="text-xs text-text-muted">{label}</p>
          <Skeleton class="mt-1 h-4 w-24" />
        </div>
      {/each}
    </div>
    <div class="overflow-x-auto">
      <div
        class="grid min-w-[36rem] gap-px"
        style="grid-template-columns: 2.25rem repeat(24, minmax(0, 1fr));"
      >
        <div></div>
        {#each hours as hour (hour)}
          <div class="pb-1 text-center text-[10px] text-text-muted">
            {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
          </div>
        {/each}
        {#each weekdays as weekday (weekday)}
          <Skeleton class="h-3 w-6 self-center" />
          {#each hours as hour (`${weekday}-${hour}`)}
            <Skeleton class="h-4 w-full rounded-[2px]" />
          {/each}
        {/each}
      </div>
    </div>
  </Card>

  <div class="grid gap-3 md:grid-cols-2">
    {#each ['Most-played arenas', 'Classes played'] as title (title)}
      <Card padding="sm">
        <h3 class="mb-3 text-sm font-semibold text-white">{title}</h3>
        <ul class="flex flex-col gap-3">
          {#each barRows as width (width)}
            <li class="flex flex-col gap-1">
              <div class="flex items-center justify-between">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="h-3 w-16" />
              </div>
              <Skeleton class="h-1.5 w-full rounded-full" />
            </li>
          {/each}
        </ul>
      </Card>
    {/each}
  </div>

  <div class="grid gap-3 md:grid-cols-2">
    <Card padding="sm">
      <h3 class="mb-3 text-sm font-semibold text-white">Top foes</h3>
      <ul class="flex flex-col gap-3">
        {#each barRows as width (width)}
          <li class="flex items-center gap-3">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <Skeleton class="h-4 min-w-0 flex-1" />
            <Skeleton class="h-3 w-14 shrink-0" />
          </li>
        {/each}
      </ul>
    </Card>
    <Card padding="sm">
      <h3 class="mb-3 text-sm font-semibold text-white">Rivals</h3>
      <ul class="flex flex-col gap-3">
        {#each ['Nemesis', 'Most dominated', 'Most dueled'] as label (label)}
          <li class="flex items-center gap-3">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <div class="min-w-0 flex-1">
              <p class="text-xs text-text-muted">{label}</p>
              <Skeleton class="mt-1 h-4 w-32" />
              <Skeleton class="mt-1 h-3 w-40" />
            </div>
          </li>
        {/each}
      </ul>
    </Card>
  </div>

  {#each ['Recent duels', 'Recent double duels'] as title (title)}
    <div>
      <h3 class="mb-3 text-sm font-semibold text-white">{title}</h3>
      <Card padding="none">
        <div class="divide-y divide-border-default">
          {#each tableRows as row (row)}
            <div class="flex items-center gap-4 px-4 py-2">
              <Skeleton class="h-3 w-16 shrink-0" />
              <Skeleton class="size-5 shrink-0 rounded-full" />
              <Skeleton class="h-4 w-28" />
              <Skeleton class="ml-auto h-3 w-12" />
              <Skeleton class="h-3 w-20" />
            </div>
          {/each}
        </div>
      </Card>
    </div>
  {/each}
</div>
