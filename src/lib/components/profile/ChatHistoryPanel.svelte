<script lang="ts">
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import type { PlatformRegion } from '$lib/types/mge';
  import type { ChatWindow, ProfileChatMessage, ProfileChatPage } from '$lib/types/profile';

  let { steamId, regions }: { steamId: string; regions: PlatformRegion[] } = $props();

  let region = $state('all');
  let days = $state<ChatWindow>('30');
  let extra = $state<{ key: string; messages: ProfileChatMessage[]; cursor: number | null } | null>(
    null,
  );
  let loadingMore = $state(false);
  let moreError = $state<string | null>(null);

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

  const filterKey = $derived(`${steamId}\n${region}\n${days}`);
  const extraMessages = $derived(extra?.key === filterKey ? extra.messages : []);

  const firstPage = $derived.by(() => {
    const player = steamId;
    const selectedRegion = region;
    const selectedDays = days;
    const params = new URLSearchParams({ days: selectedDays, region: selectedRegion });
    return fetch(`/api/users/${encodeURIComponent(player)}/chat?${params}`).then(async (res) => {
      if (!res.ok) throw new Error('failed');
      return (await res.json()) as ProfileChatPage;
    });
  });

  function formatWhen(ts: string): string {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleString();
  }

  function serverLabel(row: ProfileChatMessage): string {
    return row.serverName?.trim() || row.serverIp;
  }

  function cursorAfter(page: ProfileChatPage): number | null {
    if (extra?.key === filterKey) return extra.cursor;
    return page.nextCursor;
  }

  function setRegion(value: string) {
    region = value;
    moreError = null;
  }

  function setDays(value: string) {
    if (value === '7' || value === '30' || value === '90' || value === 'all') days = value;
    moreError = null;
  }

  async function loadMore(page: ProfileChatPage) {
    const cursor = cursorAfter(page);
    if (cursor == null || loadingMore) return;
    loadingMore = true;
    moreError = null;
    const params = new URLSearchParams({ days, region, cursor: String(cursor) });
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(steamId)}/chat?${params}`);
      if (!res.ok) throw new Error('failed');
      const next = (await res.json()) as ProfileChatPage;
      const prior = extra?.key === filterKey ? extra.messages : [];
      extra = { key: filterKey, messages: [...prior, ...next.messages], cursor: next.nextCursor };
    } catch {
      moreError = 'Could not load more messages.';
    } finally {
      loadingMore = false;
    }
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

  {#await firstPage}
    <p class="text-sm text-text-muted">Loading chat.</p>
  {:then page}
    {@const rows = [...page.messages, ...extraMessages]}
    {@const more = cursorAfter(page)}
    {#if rows.length === 0}
      <Card>
        <p class="text-sm text-text-body">No chat in this window.</p>
      </Card>
    {:else}
      <ul class="flex flex-col gap-2">
        {#each rows as row (row.id)}
          <li>
            <Card padding="sm">
              <div class="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <time datetime={row.ts}>{formatWhen(row.ts)}</time>
                <span class="uppercase">{row.region}</span>
                <span class="text-text-body">{serverLabel(row)}</span>
                <Badge color={row.scope === 'team' ? 'blue' : 'zinc'}>
                  {row.scope === 'team' ? 'Team' : 'All'}
                </Badge>
                {#if row.map}
                  <span>{row.map}</span>
                {/if}
              </div>
              <p class="mt-1 text-sm break-words whitespace-pre-wrap text-text-label">
                {row.message}
              </p>
            </Card>
          </li>
        {/each}
      </ul>
    {/if}

    {#if more != null}
      <div>
        <Button variant="secondary" size="sm" disabled={loadingMore} onclick={() => loadMore(page)}>
          {loadingMore ? 'Loading.' : 'Load more'}
        </Button>
      </div>
    {/if}
  {:catch}
    <p class="text-sm text-danger-400">Could not load chat history.</p>
  {/await}

  {#if moreError}
    <p class="text-sm text-danger-400">{moreError}</p>
  {/if}
</div>
