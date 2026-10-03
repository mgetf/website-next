<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import type { PlatformRegion } from '$lib/types/mge';
  import type { ChatWindow, ProfileChatMessage, ProfileChatPage } from '$lib/types/profile';
  import { flagForRegion } from '$lib/utils/regions';

  let { steamId, regions }: { steamId: string; regions: PlatformRegion[] } = $props();

  let region = $state('all');
  let days = $state<ChatWindow>('30');
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let page = $state<ProfileChatPage | null>(null);
  let cursors = $state<(number | undefined)[]>([undefined]);
  let index = $state(0);
  let generation = 0;

  const regionOptions = $derived([
    { value: 'all', label: 'All regions' },
    ...regions.map((row) => ({ value: row.code, label: row.code.toUpperCase() })),
  ]);

  const dayOptions: { value: ChatWindow; label: string }[] = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: 'all', label: 'All time' },
  ];

  async function loadPage(nextIndex = 0, nextCursors?: (number | undefined)[]) {
    const stack = nextCursors ?? [undefined];
    const id = ++generation;
    status = 'loading';
    const params = new URLSearchParams({ days, region });
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
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(ts: string): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, {
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

  function setRegion(value: string) {
    region = value;
    page = null;
    void loadPage(0, [undefined]);
  }

  function setDays(value: string) {
    if (value === '7' || value === '30' || value === '90' || value === 'all') days = value;
    page = null;
    void loadPage(0, [undefined]);
  }

  function newer() {
    if (index === 0 || status === 'loading') return;
    void loadPage(index - 1, cursors);
  }

  function older() {
    if (!page?.nextCursor || status === 'loading') return;
    const next = index + 1;
    const stack = cursors.slice(0, next);
    stack[next] = page.nextCursor;
    void loadPage(next, stack);
  }
</script>

<div class="flex flex-col gap-4">
  <div class="grid gap-3 sm:grid-cols-2">
    <FormSelect
      label="Region"
      name="chat-region"
      value={region}
      options={regionOptions}
      onChange={setRegion}
    />
    <FormSelect
      label="Window"
      name="chat-days"
      value={days}
      options={dayOptions}
      onChange={setDays}
    />
  </div>

  <Card padding="none" class="overflow-hidden">
    {#key index}
      <div class="h-[50rem] overflow-y-auto px-4 py-3">
        {#if status === 'loading'}
          <p class="text-sm text-text-muted">Loading chat.</p>
        {:else if status === 'error' || !page}
          <p class="text-sm text-danger-400">Could not load chat history.</p>
        {:else if page.messages.length === 0}
          <p class="text-sm text-text-body">No chat in this window.</p>
        {:else}
          {@const groups = groupByDay(page.messages)}
          <div class="flex flex-col">
            {#each groups as group (group.key)}
              <section>
                <h3 class="pt-3 pb-1 text-xs font-medium tracking-wide text-text-muted uppercase">
                  {group.label}
                </h3>
                <ul>
                  {#each group.messages as row (row.id)}
                    <li class="flex items-center gap-2 py-0.5 text-sm leading-5" title={place(row)}>
                      <span class="inline-flex shrink-0" aria-label={row.region.toUpperCase()}>
                        <FlagIcon code={flagForRegion(row.region, regions)} class="h-3 w-4" />
                      </span>
                      <time
                        datetime={row.ts}
                        class="w-11 shrink-0 text-right text-xs text-text-muted tabular-nums whitespace-nowrap"
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
          </div>
        {/if}
      </div>
    {/key}
    {#snippet footer()}
      <div class="flex items-center justify-between gap-3 px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === 0 || status === 'loading'}
          onclick={newer}
        >
          Newer
        </Button>
        <span class="text-sm text-text-muted">Page {index + 1}</span>
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
    {/snippet}
  </Card>
</div>
