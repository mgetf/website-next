<script lang="ts">
	type Notification = {
		id: number;
		type: number;
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
	
	async function markAsRead(id: number) {
		try {
			await fetch(`/notifications/${id}/read`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
		} catch (error) {
			console.error('Error marking notification as read:', error);
		}
	}
	
	function getNotificationText(type: number): string {
		switch (type) {
			case 0:
				return 'New match activity';
			case 1:
				return 'New team activity';
			default:
				return 'New notification';
		}
	}
	
	function formatDate(date: Date): string {
		return new Date(date).toLocaleString();
	}
</script>

<div class="px-2 py-1 rounded-lg border-neutral-400 relative">
	<button onclick={toggleDropdown} class="relative">
		<img class="h-6 w-6 cursor-pointer" src="/images/bell-logo.svg" alt="Notifications" />
		{#if notificationCount > 0}
			<div class="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
				{notificationCount}
			</div>
		{/if}
	</button>

	{#if open}
		<div class="absolute right-0 mt-2 w-72 bg-black bg-opacity-90 rounded-lg shadow-lg py-2 z-50">
			{#if notifications.length > 0}
				{#each notifications as notification}
					<div class="block px-4 py-2 text-gray-200 hover:bg-gray-800 cursor-pointer text-sm border-b border-gray-700">
						<div class="flex items-center">
							<div class="flex-grow">
								<a
									href={notification.url}
									onclick={() => markAsRead(notification.id)}
									class="block w-full"
								>
									{getNotificationText(notification.type)}
									<div class="text-xs text-gray-400">
										{formatDate(notification.createdAt)}
									</div>
								</a>
							</div>
						</div>
					</div>
				{/each}
			{:else}
				<div class="px-4 py-2 text-gray-400 text-sm">No new notifications</div>
			{/if}
		</div>
	{/if}
</div>

