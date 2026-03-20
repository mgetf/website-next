<script lang="ts">
	import type { BracketRound } from '$lib/types/bracket';
	import BracketRoundComponent from './BracketRound.svelte';

	interface Props {
		rounds: BracketRound[];
		label?: string;
		isLosersBracket?: boolean;
	}

	let { rounds, label, isLosersBracket = false }: Props = $props();

	let stageEl: HTMLDivElement | undefined = $state();
	let feedInPaths = $state<string[]>([]);
	let svgW = $state(0);
	let svgH = $state(0);

	interface FeedInTransition {
		roundIdx: number;
	}

	const feedInTransitions = $derived(
		rounds.reduce<FeedInTransition[]>((acc, _round, i) => {
			if (i < rounds.length - 1 && rounds[i + 1].matches.length > rounds[i].matches.length) {
				acc.push({ roundIdx: i });
			}
			return acc;
		}, []),
	);

	const hasFeedIns = $derived(feedInTransitions.length > 0);

	function buildWinnerMap(round: BracketRound): Map<string, number> {
		const map = new Map<string, number>();
		round.matches.forEach((m, idx) => {
			const winner = m.side1.isWinner ? m.side1 : m.side2.isWinner ? m.side2 : null;
			if (winner) map.set(winner.label, idx);
		});
		return map;
	}

	function measure() {
		if (!stageEl || feedInTransitions.length === 0) return;

		const stageRect = stageEl.getBoundingClientRect();
		svgW = stageRect.width;
		svgH = stageRect.height;

		const roundEls = stageEl.querySelectorAll<HTMLElement>('[data-round-idx]');
		const paths: string[] = [];

		for (const transition of feedInTransitions) {
			const curRoundEl = Array.from(roundEls).find(
				(el) => el.dataset.roundIdx === String(transition.roundIdx),
			);
			const nextRoundEl = Array.from(roundEls).find(
				(el) => el.dataset.roundIdx === String(transition.roundIdx + 1),
			);
			if (!curRoundEl || !nextRoundEl) continue;

			const curSlots = curRoundEl.querySelectorAll('.match-slot');
			const nextSlots = nextRoundEl.querySelectorAll('.match-slot');

			const curRound = rounds[transition.roundIdx];
			const nextRound = rounds[transition.roundIdx + 1];
			const winnerMap = buildWinnerMap(curRound);

			for (let ni = 0; ni < nextRound.matches.length; ni++) {
				const nextMatch = nextRound.matches[ni];
				const nextSlot = nextSlots[ni];
				if (!nextSlot) continue;

				const s1Idx = winnerMap.get(nextMatch.side1.label);
				const s2Idx = winnerMap.get(nextMatch.side2.label);
				const curIdx = s1Idx ?? s2Idx;
				if (curIdx === undefined) continue;

				const curSlot = curSlots[curIdx];
				if (!curSlot) continue;

				const curRect = curSlot.getBoundingClientRect();
				const nextRect = nextSlot.getBoundingClientRect();

				const x1 = curRect.right - stageRect.left;
				const y1 = curRect.top + curRect.height / 2 - stageRect.top;
				const x2 = nextRect.left - stageRect.left;
				const y2 = nextRect.top + nextRect.height / 2 - stageRect.top;

				const midX = x1 + (x2 - x1) / 2;
				paths.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
			}
		}

		feedInPaths = paths;
	}

	$effect(() => {
		if (!stageEl || !hasFeedIns) return;

		measure();

		const observer = new ResizeObserver(() => measure());
		observer.observe(stageEl);

		return () => observer.disconnect();
	});
</script>

<div class="flex flex-col">
	{#if label}
		<div class="text-sm font-semibold text-text-label mb-3">{label}</div>
	{/if}

	<div class="bracket-stage" bind:this={stageEl}>
		{#each rounds as round, i (round.number)}
			{@const nextCount = i < rounds.length - 1 ? rounds[i + 1].matches.length : 0}
			{@const prevCount = i > 0 ? rounds[i - 1].matches.length : 0}
			{@const isFeedInSource = nextCount > round.matches.length}
			{@const isFeedInTarget = prevCount > 0 && prevCount < round.matches.length}
			{@const noMerge = nextCount > 0 && nextCount >= round.matches.length && !isFeedInSource}
			<div class="shrink-0 flex" class:bracket-gap={i > 0} data-round-idx={i}>
				<BracketRoundComponent
					{round}
					isFirstRound={i === 0}
					isLastRound={i === rounds.length - 1}
					straightOutgoing={noMerge}
					suppressOutgoing={isFeedInSource}
					suppressIncoming={isFeedInTarget}
				/>
			</div>
		{/each}

		{#if feedInPaths.length > 0}
			<svg
				class="feed-in-overlay"
				width={svgW}
				height={svgH}
				viewBox="0 0 {svgW} {svgH}"
			>
				{#each feedInPaths as path}
					<path d={path} stroke="var(--bracket-connector-color, var(--color-border-input))" stroke-width="2" fill="none" />
				{/each}
			</svg>
		{/if}
	</div>
</div>

<style>
	:global(:root) {
		--bracket-match-width: 12rem;
		--bracket-round-gap: 2.5rem;
		--bracket-connector-color: var(--color-border-input);
		--bracket-connector-width: 2px;
		--bracket-match-pad-x: 0.5rem;
		--bracket-match-pad-y: 0.375rem;
		--bracket-meta-pad-y: 0.25rem;
		--bracket-font-size: 0.8125rem;
		--bracket-slot-pad: 0.1875rem;
		--bracket-stage-gap: 2rem;
	}

	.bracket-stage {
		position: relative;
		display: flex;
		align-items: stretch;
	}

	.bracket-gap {
		margin-left: var(--bracket-round-gap);
	}

	.feed-in-overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		overflow: visible;
	}
</style>
