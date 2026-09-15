<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import {
    CHAT_REGION_FILTERS,
    MOCK_CHAT_LOG,
    type ChatRegion,
    type MockChatLine,
  } from './mock-data';

  let region = $state<'all' | ChatRegion>('all');

  const lines = $derived(
    region === 'all' ? MOCK_CHAT_LOG : MOCK_CHAT_LOG.filter((row) => row.region === region),
  );

  const groups = $derived.by(() => {
    const byDay: { day: string; rows: MockChatLine[] }[] = [];
    for (const line of lines) {
      const last = byDay.at(-1);
      if (last && last.day === line.day) last.rows.push(line);
      else byDay.push({ day: line.day, rows: [line] });
    }
    return byDay;
  });
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-sm font-semibold text-white">Chat history</h2>
      <p class="mt-1 text-xs text-text-muted">
        Staff only. This player's say on official mge.tf servers. Ingest is not wired.
      </p>
    </div>
    <div
      class="flex overflow-hidden rounded-lg border border-border-input"
      role="group"
      aria-label="Chat region"
    >
      {#each CHAT_REGION_FILTERS as chip (chip.id)}
        <button
          type="button"
          class="px-3 py-1.5 text-xs font-medium transition-colors {region === chip.id
            ? 'bg-primary-700 text-white'
            : 'bg-surface-input text-text-body hover:bg-surface-hover'}"
          aria-pressed={region === chip.id}
          onclick={() => (region = chip.id)}
        >
          {chip.label}
        </button>
      {/each}
    </div>
  </div>

  <Card padding="none">
    {#if groups.length === 0}
      <p class="py-8 text-center text-sm text-text-muted">No chat in this region.</p>
    {:else}
      <ul class="divide-y divide-border-default">
        {#each groups as group (group.day)}
          <li>
            <p class="bg-surface-input/60 px-4 py-1.5 text-xs font-medium text-text-muted">
              {group.day}
            </p>
            <ul>
              {#each group.rows as line (line.id)}
                <li
                  class="flex flex-col gap-0.5 px-4 py-2 sm:grid sm:grid-cols-[4.75rem_minmax(0,9.5rem)_3rem_minmax(0,1fr)] sm:items-baseline sm:gap-3"
                >
                  <span class="font-mono text-xs text-text-muted">{line.time}</span>
                  <span class="truncate text-xs text-text-body">{line.server}</span>
                  <span class="text-xs uppercase text-text-muted">{line.channel}</span>
                  <span class="min-w-0 wrap-break-word text-sm text-text-label">{line.text}</span>
                </li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    {/if}
  </Card>
</div>
