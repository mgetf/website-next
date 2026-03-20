<script lang="ts">
	import type { BracketRound } from '$lib/types/bracket';
	import MatchCard from './MatchCard.svelte';

	interface Props {
		round: BracketRound;
		isFirstRound: boolean;
		isLastRound: boolean;
		straightOutgoing?: boolean;
	}

	let { round, isFirstRound, isLastRound, straightOutgoing = false }: Props = $props();
</script>

<div class="flex flex-col flex-1">
	<div class="text-xs font-semibold text-text-muted uppercase tracking-wider pb-3 text-center"
		style:width="var(--bracket-match-width)"
	>
		{round.label}
	</div>

	<div class="match-column">
		{#each round.matches as match (match.id)}
			<div
				class="match-slot"
				class:has-incoming={!isFirstRound}
				class:has-outgoing={!isLastRound}
				class:is-straight={!isLastRound && straightOutgoing}
				class:is-odd={!isLastRound && !straightOutgoing && match.position % 2 === 1}
				class:is-even={!isLastRound && !straightOutgoing && match.position % 2 === 0}
			>
				<div style:width="var(--bracket-match-width)">
					<MatchCard {match} />
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.match-column {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.match-slot {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		padding: 0.25rem 0;
	}

	/* Incoming connector: horizontal line from gap midpoint to match */
	.match-slot.has-incoming::before {
		content: '';
		position: absolute;
		left: calc(-1 * var(--bracket-round-gap) / 2);
		width: calc(var(--bracket-round-gap) / 2);
		top: 50%;
		border-top: var(--bracket-connector-width) solid var(--bracket-connector-color);
	}

	/* Outgoing connector for straight rounds (same match count next round):
	   horizontal line only, no vertical branching */
	.match-slot.has-outgoing.is-straight::after {
		content: '';
		position: absolute;
		right: calc(-1 * var(--bracket-round-gap) / 2);
		width: calc(var(--bracket-round-gap) / 2);
		top: 50%;
		border-top: var(--bracket-connector-width) solid var(--bracket-connector-color);
	}

	/* Outgoing connector for odd positions (top of pair):
	   horizontal line at 50% going right, vertical line going down */
	.match-slot.has-outgoing.is-odd::after {
		content: '';
		position: absolute;
		right: calc(-1 * var(--bracket-round-gap) / 2);
		width: calc(var(--bracket-round-gap) / 2);
		top: 50%;
		bottom: 0;
		border-top: var(--bracket-connector-width) solid var(--bracket-connector-color);
		border-right: var(--bracket-connector-width) solid var(--bracket-connector-color);
	}

	/* Outgoing connector for even positions (bottom of pair):
	   horizontal line at 50% going right, vertical line going up */
	.match-slot.has-outgoing.is-even::after {
		content: '';
		position: absolute;
		right: calc(-1 * var(--bracket-round-gap) / 2);
		width: calc(var(--bracket-round-gap) / 2);
		top: 0;
		bottom: 50%;
		border-bottom: var(--bracket-connector-width) solid var(--bracket-connector-color);
		border-right: var(--bracket-connector-width) solid var(--bracket-connector-color);
	}
</style>
