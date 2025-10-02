<script lang="ts">
	type Announcement = {
		id: number;
		title: string | null;
		content: string;
		visible: number;
		createdAt: Date | string;
	};
	
	type Props = {
		announcements: Array<{
			id: number;
			title: string | null;
			content: string;
			visible: number;
			createdAt: Date | string;
		}>;
	};
	
	let { announcements }: Props = $props();
	
	// Filter visible announcements
	let visibleAnnouncements = $derived(
		announcements.filter(a => a.visible === 1)
	);
</script>

{#if visibleAnnouncements.length > 0}
	<div class="my-4 mx-auto w-full max-w-4xl">
		<div class="bg-gradient-to-t from-red-800/90 to-red-600/80 rounded-lg">
			{#each visibleAnnouncements as announcement}
				<div class="p-4">
					{#if announcement.title}
						<h3 class="text-xl font-semibold text-red-100 mb-2">{announcement.title}</h3>
					{/if}
					<p class="text-gray-200 text-center font-medium">{announcement.content}</p>
				</div>
			{/each}
		</div>
	</div>
{/if}

