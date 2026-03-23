<script lang="ts">
  import { notificationState, type Notification } from '$lib/state/notifications.svelte';
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';

  type Props = {
    notifications: Notification[];
    userSteamId: string;
  };

  let { notifications: initialNotifications, userSteamId }: Props = $props();

  let open = $state(false);

  // Initialize the notification state with server data
  $effect(() => {
    notificationState.initialize(initialNotifications);
  });

  // Track when new notifications arrive for visual feedback
  let previousCount = $state(notificationState.unreadCount);
  $effect(() => {
    if (notificationState.unreadCount > previousCount) {
      notificationState.hasNewNotification = true;
      setTimeout(() => {
        notificationState.hasNewNotification = false;
      }, 2000);
    }
    previousCount = notificationState.unreadCount;
  });

  // Cleanup SSE connection on component destroy
  onDestroy(() => {
    notificationState.disconnect();
  });

  function toggleDropdown() {
    open = !open;
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.notification-dropdown-container')) {
      open = false;
    }
  }

  async function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      await notificationState.markAsRead(notification.id);
    }
    open = false;
    goto(notification.url);
  }

  async function handleMarkOneRead(event: MouseEvent, notificationId: number) {
    event.stopPropagation();
    await notificationState.markAsRead(notificationId);
  }

  async function handleMarkAllRead() {
    await notificationState.markAllRead();
  }

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
      case 'ADMIN_ACTION':
        return '🛡️';
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
      case 'ADMIN_ACTION':
        return 'Admin action';
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
      });
    }
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="notification-dropdown-container relative">
  <button
    onclick={toggleDropdown}
    class="relative p-2 text-text-body hover:text-white hover:bg-surface-input/50 rounded-lg transition-all"
    aria-label="Notifications"
  >
    <svg
      class="w-6 h-6"
      class:animate-pulse={notificationState.hasNewNotification}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
    {#if notificationState.unreadCount > 0}
      <div
        class="absolute top-1 right-1 bg-danger-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold"
        class:animate-bounce={notificationState.hasNewNotification}
      >
        {notificationState.unreadCount > 9 ? '9+' : notificationState.unreadCount}
      </div>
    {/if}
  </button>

  {#if open}
    <div
      class="absolute right-0 mt-2 w-80 bg-surface-card border border-border-default rounded-lg shadow-xl overflow-hidden z-50"
    >
      <!-- Header -->
      <div class="px-4 py-2 border-b border-border-default flex justify-between items-center">
        <span class="text-sm font-medium text-white">Notifications</span>
        {#if notificationState.unreadCount > 0}
          <span class="text-xs text-text-muted">{notificationState.unreadCount} unread</span>
        {/if}
      </div>

      {#if notificationState.dropdownNotifications.length > 0}
        <div class="max-h-96 overflow-y-auto">
          {#each notificationState.dropdownNotifications as notification (notification.id)}
            <div
              role="button"
              tabindex="0"
              onclick={() => handleNotificationClick(notification)}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleNotificationClick(notification);
                }
              }}
              class="w-full text-left px-4 py-3 border-b border-border-default/50 last:border-b-0 transition-all group
								{notification.isRead
                ? 'bg-transparent hover:bg-surface-input/30'
                : 'bg-surface-input/20 hover:bg-surface-input/40'}"
            >
              <div class="flex items-start gap-3">
                <!-- Avatar or Icon -->
                <div class="flex-shrink-0 mt-0.5">
                  {#if notification.actor?.steamAvatar}
                    <img
                      src={notification.actor.steamAvatar}
                      alt={notification.actor.steamUsername}
                      class="w-8 h-8 rounded-full"
                    />
                  {:else}
                    <div
                      class="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-lg"
                    >
                      {getNotificationIcon(notification.type)}
                    </div>
                  {/if}
                </div>

                <!-- Content -->
                <div class="flex-grow min-w-0">
                  <p
                    class="text-sm leading-snug {notification.isRead
                      ? 'text-text-body'
                      : 'text-white font-medium'}"
                  >
                    {#if notification.actor?.steamUsername}
                      <span class="text-blue-400">{notification.actor.steamUsername}</span>:
                    {/if}
                    {notification.message || getFallbackText(notification.type)}
                  </p>
                  <p
                    class="text-xs {notification.isRead
                      ? 'text-text-muted'
                      : 'text-text-muted'} mt-1"
                  >
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>

                <!-- Mark as read button -->
                {#if !notification.isRead}
                  <button
                    onclick={(e) => handleMarkOneRead(e, notification.id)}
                    class="flex-shrink-0 p-1 text-text-muted hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Mark as read"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <!-- Footer -->
        <div class="border-t border-border-default p-2 flex items-center justify-between gap-2">
          {#if notificationState.unreadCount > 0}
            <button
              onclick={handleMarkAllRead}
              class="flex-1 px-3 py-2 text-xs text-text-body hover:text-white hover:bg-surface-input/50 rounded transition-all"
            >
              Mark all as read
            </button>
          {:else}
            <div class="flex-1"></div>
          {/if}
          <a
            href="/users/{userSteamId}/notifications"
            onclick={() => {
              open = false;
            }}
            class="flex-1 px-3 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-surface-input/50 rounded text-center transition-all"
          >
            See all notifications
          </a>
        </div>
      {:else}
        <div class="px-4 py-8 text-center">
          <div
            class="w-12 h-12 bg-surface-input rounded-full flex items-center justify-center mx-auto mb-3"
          >
            <svg
              class="w-6 h-6 text-text-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
          </div>
          <p class="text-text-body text-sm">No notifications yet</p>
          <p class="text-text-muted text-xs mt-1">You're all caught up!</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
