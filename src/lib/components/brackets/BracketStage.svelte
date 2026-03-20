<script lang="ts">
	import type { BracketRound } from '$lib/types/bracket';
	import BracketRoundComponent from './BracketRound.svelte';

	interface Props {
		rounds: BracketRound[];
		label?: string;
	}

	let { rounds, label }: Props = $props();
</script>

<div class="flex flex-col">
	{#if label}
		<div class="text-sm font-semibold text-text-label mb-3">{label}</div>
	{/if}

	<div
		class="bracket-stage flex items-stretch"
		style:--bracket-match-width="14rem"
		style:--bracket-round-gap="3rem"
		style:--bracket-connector-color="var(--color-border-input)"
		style:--bracket-connector-width="2px"
	>
		{#each rounds as round, i (round.number)}
			<div class="shrink-0 flex" class:bracket-gap={i > 0}>
				<BracketRoundComponent
					{round}
					isFirstRound={i === 0}
					isLastRound={i === rounds.length - 1}
					straightOutgoing={i < rounds.length - 1 && rounds[i + 1].matches.length === round.matches.length}
				/>
			</div>
		{/each}
	</div>
</div>

<style>
	.bracket-gap {
		margin-left: var(--bracket-round-gap);
	}
</style>
