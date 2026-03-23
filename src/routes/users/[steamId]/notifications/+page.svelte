<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { goto, invalidateAll } from '$app/navigation';
  import { notificationState } from '$lib/state/notifications.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { data }: { data: PageData } = $props();

  let isMarkingAllRead = $state(false);

  function getNotificationIcon(type: string): string {
    switch (type) {
      case 'MATCH_COMM':
        return '💬';
      case 'PENDING_PLAYER':
        return '👤';
      case 'MATCH_CREATED':
        return '⚔️';
      case 'PLAYER_INVITE':
        return '📩';
      default:
        return '🔔';
    }
  }

  function getFallbackText(type: string): string {
    switch (type) {
      case 'MATCH_COMM':
        return 'New match activity';
      case 'PENDING_PLAYER':
        return 'New player join request';
      case 'MATCH_CREATED':
        return 'New match scheduled';
      case 'PLAYER_INVITE':
        return 'Team invitation';
      default:
        return 'New notification';
    }
  }

  function formatRelativeTime(date: Date | string): string {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return then.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  }

  async function handleMarkAsRead(notificationId: number) {
    await notificationState.markAsRead(notificationId);
    await invalidateAll();
  }

  function handleMarkAllReadEnhance() {
    isMarkingAllRead = true;
    return async ({ result }: { result: any }) => {
      isMarkingAllRead = false;
      if (result.type === 'success') {
        notificationState.notifications = notificationState.notifications.map((n) => ({
          ...n,
          isRead: true,
        }));
        await invalidateAll();
      }
    };
  }
</script>

<svelte:head>
  <title>Notifications - MGE.tf</title>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 py-8">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-white">Notifications</h1>
      <p class="text-sm text-text-body mt-1">
        {#if data.unreadCount > 0}
          {data.unreadCount} unread of {data.totalCount} total
        {:else}
          {data.totalCount} notifications
        {/if}
      </p>
    </div>

    {#if data.unreadCount > 0}
      <form method="POST" action="?/markAllRead" use:enhance={handleMarkAllReadEnhance}>
        <button
          type="submit"
          disabled={isMarkingAllRead}
          class="px-4 py-2 text-sm font-medium text-primary-400 hover:text-primary-300 hover:bg-surface-hover rounded-lg transition-all disabled:opacity-50"
        >
          {isMarkingAllRead ? 'Marking...' : 'Mark all as read'}
        </button>
      </form>
    {/if}
  </div>

  {#if data.notifications.length > 0}
    <Card padding="none" class="overflow-hidden">
      {#each data.notifications as notification (notification.id)}
        <a
          href={notification.url}
          onclick={() => {
            if (!notification.isRead) {
              handleMarkAsRead(notification.id);
            }
          }}
          class="block px-4 py-4 border-b border-border-default last:border-b-0 transition-all
            {notification.isRead
            ? 'bg-transparent hover:bg-surface-hover/30'
            : 'bg-surface-input/20 hover:bg-surface-input/40'}"
        >
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0">
              {#if notification.actor?.steamAvatar}
                <img
                  src={notification.actor.steamAvatar}
                  alt={notification.actor.steamUsername}
                  class="w-10 h-10 rounded-full"
                />
              {:else}
                <div
                  class="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center text-xl"
                >
                  {getNotificationIcon(notification.type)}
                </div>
              {/if}
            </div>

            <div class="flex-grow min-w-0">
              <p
                class="text-sm leading-snug {notification.isRead
                  ? 'text-text-body'
                  : 'text-white font-medium'}"
              >
                {#if notification.actor?.steamUsername}
                  <span class="text-primary-400">{notification.actor.steamUsername}</span>:
                {/if}
                {notification.message || getFallbackText(notification.type)}
              </p>
              <p class="text-xs {notification.isRead ? 'text-text-muted' : 'text-text-muted'} mt-1">
                {formatRelativeTime(notification.createdAt)}
              </p>
            </div>

            {#if !notification.isRead}
              <div class="flex-shrink-0">
                <div class="w-2 h-2 bg-primary-500 rounded-full"></div>
              </div>
            {/if}
          </div>
        </a>
      {/each}
    </Card>

    {#if data.totalPages > 1}
      <div class="flex items-center justify-between mt-6">
        <div class="text-sm text-text-muted">
          Page {data.currentPage} of {data.totalPages}
        </div>
        <div class="flex items-center gap-2">
          {#if data.hasPrevPage}
            <Button href="?page={data.currentPage - 1}" variant="secondary" size="sm">
              Previous
            </Button>
          {/if}
          {#if data.hasNextPage}
            <Button href="?page={data.currentPage + 1}" variant="secondary" size="sm">Next</Button>
          {/if}
        </div>
      </div>
    {/if}
  {:else}
    <Card padding="lg" class="text-center py-8">
      <div
        class="w-16 h-16 bg-surface-input rounded-full flex items-center justify-center mx-auto mb-4"
      >
        <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
      </div>
      <h2 class="text-lg font-medium text-white mb-2">No notifications yet</h2>
      <p class="text-text-body text-sm">When you receive notifications, they'll appear here.</p>
    </Card>
  {/if}
</div>
