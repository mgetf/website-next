<script lang="ts">
	import type { BracketData } from '$lib/types/bracket';
	import BracketStage from './BracketStage.svelte';

	interface Props {
		data: BracketData;
	}

	let { data }: Props = $props();
</script>

<div class="overflow-x-auto">
	{#if data.title}
		<h3 class="text-lg font-bold text-text-heading mb-4">{data.title}</h3>
	{/if}

	<BracketStage rounds={data.rounds} />
</div>
