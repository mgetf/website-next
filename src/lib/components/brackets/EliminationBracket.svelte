<script lang="ts">
	import type { BracketData } from '$lib/types/bracket';
	import BracketStage from './BracketStage.svelte';
	import MatchCard from './MatchCard.svelte';

	interface Props {
		data: BracketData;
	}

	let { data }: Props = $props();

	const isDoubleElim = $derived(data.format === 'double_elim');
</script>

<div class="overflow-x-auto">
	{#if data.title}
		<h3 class="text-lg font-bold text-text-heading mb-4">{data.title}</h3>
	{/if}

	{#if isDoubleElim}
		<div class="flex flex-col gap-10">
			<BracketStage rounds={data.rounds} label="Winners Bracket" />

			{#if data.loserRounds && data.loserRounds.length > 0}
				<BracketStage rounds={data.loserRounds} label="Losers Bracket" />
			{/if}

			{#if data.grandFinal && data.grandFinal.matches.length > 0}
				<div>
					<div class="text-sm font-semibold text-text-label mb-3">Grand Final</div>
					<div class="flex flex-col gap-3">
						{#each data.grandFinal.matches as match (match.id)}
							<div style:width="14rem">
								<MatchCard {match} />
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{:else}
		<BracketStage rounds={data.rounds} />
	{/if}
</div>
