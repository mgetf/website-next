<script lang="ts">
	type Props = {
		announcements: Array<{
			id: number;
			content: string;
			visible: number;
		}>;
	};
	
	let { announcements }: Props = $props();
	
	// Filter visible announcements (belt-and-suspenders check)
	let visibleAnnouncements = $derived(
		announcements.filter(a => a.visible === 1)
	);
</script>

{#if visibleAnnouncements.length > 0}
	<div class="w-full px-4 py-4 space-y-3">
		<div class="max-w-7xl mx-auto space-y-3">
			{#each visibleAnnouncements as announcement}
				<div class="bg-gradient-to-r from-red-800/90 to-red-600/80 rounded-lg p-4 border border-red-700/50">
					<p class="text-gray-100 text-center font-medium">{announcement.content}</p>
				</div>
			{/each}
		</div>
	</div>
{/if}

