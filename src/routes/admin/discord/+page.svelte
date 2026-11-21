<script lang="ts">
  import { enhance, type SubmitFunction } from '$app/forms';
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Card from '#lib/components/ui/Card.svelte';
  import { toast } from '#lib/state/toast.svelte.js';

  let { data }: { data: PageData } = $props();

  const overview = $derived(data.overview);

  const statusColor = {
    PENDING: 'yellow',
    CLAIMED: 'blue',
    DELIVERED: 'green',
    DEAD: 'red',
  } as const;

  const kindLabels: Record<string, string> = {
    'playoff.match_created': 'Match created',
    'playoff.score_submitted': 'Score submitted',
    'playoff.score_confirmed': 'Score confirmed',
    'playoff.score_disputed': 'Score disputed',
    'playoff.team_eliminated': 'Team eliminated',
    'playoff.bracket_complete': 'Bracket complete',
    'match.reminder': 'Match reminder',
  };
  const kindLabel = (kind: string) => kindLabels[kind] ?? kind;

  function ago(value: string | Date | null): string {
    if (!value) return 'never';
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 90) return `${seconds}s ago`;
    if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
    if (seconds < 129600) return `${Math.round(seconds / 3600)}h ago`;
    return `${Math.round(seconds / 86400)}d ago`;
  }

  function duration(seconds: number | null): string {
    if (seconds == null) return 'none waiting';
    if (seconds < 90) return `${seconds}s`;
    if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  }

  const waiting = $derived(overview.counts.PENDING + overview.counts.CLAIMED);

  const submit: SubmitFunction = () => {
    return async ({ result, update }) => {
      if (result.type === 'failure') {
        toast.error((result.data as { error?: string } | undefined)?.error ?? 'That did not work');
      } else if (result.type === 'success') {
        toast.success((result.data as { message?: string } | undefined)?.message ?? 'Done');
      }
      await update();
    };
  };
</script>

<div class="max-w-7xl mx-auto space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="text-3xl font-bold text-text-heading mb-2">Discord</h1>
      <p class="text-text-body">The bot's outbox and the direct messages people send it.</p>
    </div>
    <div class="flex items-center gap-2 text-sm">
      <Badge color={overview.bot.online ? 'green' : 'red'}>
        Bot {overview.bot.online ? 'online' : 'offline'}
      </Badge>
      <span class="text-text-muted">last poll {ago(overview.bot.lastPollAt)}</span>
    </div>
  </div>

  {#if !overview.bot.online}
    <Card padding="md" class="border-danger-500">
      <p class="text-sm text-danger-ink">
        {overview.bot.lastPollAt
          ? 'The bot has not polled the outbox for a while. Notifications queue up and send once it is back; score reports still confirm themselves.'
          : 'The bot has never polled the outbox. Check that it is running and that its API key and MGE_API_URL are right.'}
      </p>
    </Card>
  {/if}

  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <Card padding="md">
      <div class="text-sm text-text-muted">Waiting to send</div>
      <div class="text-3xl font-bold text-text-heading tabular-nums">{waiting}</div>
      <div class="text-xs text-text-muted">oldest {duration(overview.oldestPendingSeconds)}</div>
    </Card>
    <Card padding="md">
      <div class="text-sm text-text-muted">Delivered</div>
      <div class="text-3xl font-bold text-success-ink tabular-nums">
        {overview.counts.DELIVERED}
      </div>
      <div class="text-xs text-text-muted">all time</div>
    </Card>
    <Card padding="md">
      <div class="text-sm text-text-muted">Failed for good</div>
      <div
        class="text-3xl font-bold tabular-nums {overview.counts.DEAD > 0
          ? 'text-danger-ink'
          : 'text-text-heading'}"
      >
        {overview.counts.DEAD}
      </div>
      {#if overview.counts.DEAD > 0}
        <form method="POST" action="?/requeueDead" use:enhance={submit}>
          <Button type="submit" variant="secondary" size="sm">Queue all again</Button>
        </form>
      {:else}
        <div class="text-xs text-text-muted">nothing stuck</div>
      {/if}
    </Card>
    <Card padding="md">
      <div class="text-sm text-text-muted">Unread DMs</div>
      <div class="text-3xl font-bold text-text-heading tabular-nums">{overview.unhandledInbox}</div>
      <div class="text-xs text-text-muted">sent to the bot</div>
    </Card>
  </div>

  <!-- Inbox -->
  <Card padding="lg">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-bold text-text-heading">Direct messages to the bot</h2>
      <div class="flex items-center gap-3 text-sm">
        <a
          href={resolve('/admin/discord') + '?status=' + data.status}
          class={data.inboxView === 'open' ? 'font-semibold text-text-heading' : 'text-text-muted'}
          >Unhandled</a
        >
        <a
          href={resolve('/admin/discord') + '?status=' + data.status + '&inbox=all'}
          class={data.inboxView === 'all' ? 'font-semibold text-text-heading' : 'text-text-muted'}
          >All</a
        >
        {#if overview.unhandledInbox > 0}
          <form method="POST" action="?/handleAllInbox" use:enhance={submit}>
            <Button type="submit" variant="secondary" size="sm">Mark all handled</Button>
          </form>
        {/if}
      </div>
    </div>

    {#if data.inbox.length === 0}
      <p class="text-sm text-text-muted">
        {data.inboxView === 'open' ? 'Nothing waiting.' : 'No one has messaged the bot yet.'}
      </p>
    {:else}
      <ul class="divide-y divide-border-default">
        {#each data.inbox as message (message.id)}
          <li class="py-3">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div class="text-sm">
                <span class="font-semibold text-text-heading">{message.discordUsername}</span>
                {#if message.steamId}
                  <a
                    href={resolve('/users/[steamId]', { steamId: message.steamId })}
                    class="ml-2 text-primary-ink hover:underline"
                    >{message.steamUsername ?? message.steamId}</a
                  >
                {:else}
                  <span class="ml-2 text-text-muted">no linked mge.tf account</span>
                {/if}
                <span class="ml-2 text-text-muted">{ago(message.createdAt)}</span>
              </div>
              {#if message.handledAt}
                <Badge color="zinc">Handled</Badge>
              {:else}
                <form method="POST" action="?/handleInbox" use:enhance={submit}>
                  <input type="hidden" name="id" value={message.id} />
                  <Button type="submit" variant="secondary" size="sm">Mark handled</Button>
                </form>
              {/if}
            </div>
            {#if message.repliedTo}
              <p class="mt-1 text-xs text-text-muted">
                In reply to a "{kindLabel(message.repliedTo.kind)}" message
                {#if message.repliedTo.url}
                  ·
                  <a href={message.repliedTo.url} class="text-primary-ink hover:underline"
                    >open match</a
                  >
                {/if}
              </p>
            {/if}
            <p class="mt-1 whitespace-pre-wrap break-words text-sm text-text-body">
              {message.content || '(no text)'}
            </p>
            {#each message.attachments as file (file.url)}
              <a
                href={file.url}
                rel="noopener noreferrer"
                target="_blank"
                class="mr-3 text-xs text-primary-ink hover:underline">{file.name}</a
              >
            {/each}
          </li>
        {/each}
      </ul>
    {/if}
  </Card>

  <!-- Last 24 hours by kind -->
  <Card padding="lg">
    <h2 class="mb-3 text-xl font-bold text-text-heading">Last 24 hours</h2>
    {#if overview.last24h.length === 0}
      <p class="text-sm text-text-muted">No notifications queued in the last day.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-text-muted">
              <th class="py-1 pr-4 font-medium">Kind</th>
              <th class="py-1 pr-4 text-right font-medium">Delivered</th>
              <th class="py-1 pr-4 text-right font-medium">Waiting</th>
              <th class="py-1 text-right font-medium">Failed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-default">
            {#each overview.last24h as row (row.kind)}
              <tr>
                <td class="py-1.5 pr-4 text-text-heading">{kindLabel(row.kind)}</td>
                <td class="py-1.5 pr-4 text-right tabular-nums text-success-ink">{row.delivered}</td
                >
                <td class="py-1.5 pr-4 text-right tabular-nums text-text-body">{row.waiting}</td>
                <td
                  class="py-1.5 text-right tabular-nums {row.dead > 0
                    ? 'text-danger-ink'
                    : 'text-text-muted'}">{row.dead}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Card>

  <!-- Outbox -->
  <Card padding="lg">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-xl font-bold text-text-heading">Outbox</h2>
      <div class="flex gap-1 text-sm">
        {#each data.statusFilters as filter (filter)}
          <a
            href={resolve('/admin/discord') +
              `?status=${filter}` +
              (data.inboxView === 'all' ? '&inbox=all' : '')}
            class="rounded-md px-2.5 py-1 {data.status === filter
              ? 'bg-surface-input text-text-heading'
              : 'text-text-muted hover:text-text-heading'}"
          >
            {filter === 'ALL' ? 'All' : filter.charAt(0) + filter.slice(1).toLowerCase()}
          </a>
        {/each}
      </div>
    </div>

    {#if data.events.length === 0}
      <p class="text-sm text-text-muted">Nothing here.</p>
    {:else}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-text-muted">
              <th class="py-1 pr-4 font-medium">When</th>
              <th class="py-1 pr-4 font-medium">Kind</th>
              <th class="py-1 pr-4 font-medium">To</th>
              <th class="py-1 pr-4 font-medium">Status</th>
              <th class="py-1 pr-4 font-medium">Tries</th>
              <th class="py-1 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border-default">
            {#each data.events as event (event.id)}
              <tr class="align-top">
                <td class="whitespace-nowrap py-1.5 pr-4 text-text-muted">{ago(event.createdAt)}</td
                >
                <td class="py-1.5 pr-4 text-text-heading">{kindLabel(event.kind)}</td>
                <td class="py-1.5 pr-4 text-text-body">
                  {#if event.matchUrl}
                    <a href={event.matchUrl} class="text-primary-ink hover:underline"
                      >{event.target}</a
                    >
                  {:else}
                    {event.target}
                  {/if}
                </td>
                <td class="py-1.5 pr-4"
                  ><Badge color={statusColor[event.status]}>{event.status.toLowerCase()}</Badge></td
                >
                <td class="py-1.5 pr-4 tabular-nums text-text-body">{event.attempts}</td>
                <td class="py-1.5 text-text-body">
                  {#if event.lastError}
                    <span class="text-danger-ink">{event.lastError}</span>
                  {/if}
                  {#if event.status === 'DEAD' || event.status === 'CLAIMED'}
                    <form method="POST" action="?/requeue" use:enhance={submit} class="inline">
                      <input type="hidden" name="id" value={event.id} />
                      <Button type="submit" variant="secondary" size="sm"
                        >{event.status === 'DEAD' ? 'Queue again' : 'Release'}</Button
                      >
                    </form>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-text-muted">Showing the latest 50.</p>
    {/if}
  </Card>
</div>
