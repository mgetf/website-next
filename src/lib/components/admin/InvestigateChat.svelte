<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import FlagIcon from '#lib/components/ui/FlagIcon.svelte';
  import type { ProfileChatMessage, ProfileChatPage } from '#lib/types/profile.js';
  import { flagForRegion } from '#lib/utils/regions.js';

  let { steamId }: { steamId: string } = $props();

  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let page = $state<ProfileChatPage | null>(null);
  let cursors = $state<(number | undefined)[]>([undefined]);
  let index = $state(0);
  let generation = 0;

  async function loadPage(nextIndex = 0, nextCursors?: (number | undefined)[]) {
    const stack = nextCursors ?? [undefined];
    const id = ++generation;
    status = 'loading';
    const params = new URLSearchParams({ days: 'all', region: 'all' });
    const cursor = stack[nextIndex];
    if (cursor != null) params.set('cursor', String(cursor));
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(steamId)}/chat?${params}`);
      if (id !== generation) return;
      if (!res.ok) throw new Error('failed');
      page = (await res.json()) as ProfileChatPage;
      cursors = stack;
      index = nextIndex;
      status = 'ready';
    } catch {
      if (id !== generation) return;
      page = null;
      status = 'error';
    }
  }

  onMount(() => {
    void loadPage();
  });

  function dayKey(ts: string): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function formatDay(ts: string): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatTime(ts: string): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function speaker(row: ProfileChatMessage): string {
    const name = row.name?.trim() || 'Unknown';
    return row.scope === 'team' ? `${name} (team)` : name;
  }

  function place(row: ProfileChatMessage): string {
    const server = row.serverName?.trim() || row.serverIp;
    const bits = [row.region.toUpperCase(), server];
    if (row.map) bits.push(row.map);
    return bits.join(' · ');
  }

  function groupByDay(rows: ProfileChatMessage[]): {
    key: string;
    label: string;
    messages: ProfileChatMessage[];
  }[] {
    const groups: { key: string; label: string; messages: ProfileChatMessage[] }[] = [];
    for (const row of rows) {
      const key = dayKey(row.ts);
      const last = groups.at(-1);
      if (last && last.key === key) last.messages.push(row);
      else groups.push({ key, label: formatDay(row.ts), messages: [row] });
    }
    return groups;
  }

  function newer() {
    if (index === 0 || status === 'loading') return;
    void loadPage(index - 1, cursors);
  }

  function older() {
    if (!page?.nextCursor || status === 'loading') return;
    void loadPage(index + 1, [...cursors.slice(0, index + 1), page.nextCursor]);
  }
</script>

<Card padding="none" class="overflow-hidden">
  {#snippet header()}
    <div class="flex items-center justify-between gap-2 px-4 py-3">
      <h2 class="text-base font-semibold text-white sm:text-lg">Chat</h2>
      <div class="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === 0 || status === 'loading'}
          onclick={newer}
        >
          Newer
        </Button>
        <span class="text-xs text-text-muted tabular-nums">Page {index + 1}</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!page?.nextCursor || status === 'loading'}
          onclick={older}
        >
          Older
        </Button>
      </div>
    </div>
  {/snippet}
  {#key index}
    <div class="h-[32rem] overflow-y-auto px-3 py-2">
      {#if status === 'loading' && !page}
        <p class="text-xs text-text-muted">Loading chat.</p>
      {:else if status === 'error' || !page}
        <p class="text-xs text-danger-400">Could not load chat.</p>
      {:else if page.messages.length === 0}
        <p class="text-xs text-text-body">No chat.</p>
      {:else}
        {@const groups = groupByDay(page.messages)}
        {#each groups as group (group.key)}
          <section>
            <h3
              class="pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-text-muted uppercase"
            >
              {group.label}
            </h3>
            <ul>
              {#each group.messages as row (row.id)}
                <li class="flex items-center gap-2 py-px text-xs leading-4" title={place(row)}>
                  <span class="inline-flex shrink-0" aria-label={row.region.toUpperCase()}>
                    <FlagIcon code={flagForRegion(row.region)} class="h-3.5 w-5" />
                  </span>
                  <time
                    datetime={row.ts}
                    class="w-11 shrink-0 text-right text-text-muted tabular-nums whitespace-nowrap"
                  >
                    {formatTime(row.ts)}
                  </time>
                  <p class="min-w-0 break-words text-text-label">
                    <span class="font-medium text-white">{speaker(row)}:</span>
                    {row.message}
                  </p>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </div>
  {/key}
</Card>
