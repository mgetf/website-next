<script lang="ts">
type Notification = {
  id: number;
  type: string;
  url: string;
  createdAt: Date;
};

type Props = {
  notifications: Notification[];
  notificationCount: number;
};

let { notifications, notificationCount }: Props = $props();

let open = $state(false);

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

async function handleNotificationClick(notificationId: number, url: string) {
  try {
    await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
  } finally {
    window.location.href = url;
  }
}

async function handleMarkAllRead() {
  try {
    await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
    });
    window.location.reload();
  } catch (error) {
    console.error('Error marking all as read:', error);
  }
}

function getNotificationText(type: string): string {
  switch (type) {
    case 'MATCH_COMM':
      return 'New match activity';
    case 'PENDING_PLAYER':
      return 'New player join request';
    default:
      return 'New notification';
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString();
}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="notification-dropdown-container relative">
	<button 
		onclick={toggleDropdown} 
		class="relative p-2 text-gray-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition-all"
		aria-label="Notifications"
	>
		<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
		</svg>
		{#if notificationCount > 0}
			<div class="absolute top-1 right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-semibold">
				{notificationCount}
			</div>
		{/if}
	</button>

	{#if open}
		<div class="absolute right-0 mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl overflow-hidden z-50">
			{#if notifications.length > 0}
				<div class="py-2">
					{#each notifications as notification}
						<button
							onclick={() => handleNotificationClick(notification.id, notification.url)}
							class="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-zinc-800/50 border-b border-zinc-800 last:border-b-0 transition-all"
						>
							<div class="flex items-start gap-3">
								<div class="flex-shrink-0 mt-0.5">
									<svg class="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
										<path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
									</svg>
								</div>
								<div class="flex-grow min-w-0">
									<p class="font-medium text-white">{getNotificationText(notification.type)}</p>
									<p class="text-xs text-gray-500 mt-1">
										{formatDate(notification.createdAt)}
									</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
				<div class="border-t border-zinc-800 p-2">
					<button
						onclick={handleMarkAllRead}
						class="w-full px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-zinc-800/50 rounded transition-all"
					>
						Mark all as read
					</button>
				</div>
			{:else}
				<div class="px-4 py-8 text-center">
					<svg class="w-12 h-12 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
					</svg>
					<p class="text-gray-400 text-sm">No new notifications</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

