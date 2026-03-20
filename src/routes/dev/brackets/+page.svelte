<script lang="ts">
	import type { BracketData, BracketMatch } from '$lib/types/bracket';
	import MatchCard from '$lib/components/brackets/MatchCard.svelte';
	import EliminationBracket from '$lib/components/brackets/EliminationBracket.svelte';

	import singleElim8Raw from '$lib/fixtures/brackets/single-elim-8.json';
	import singleElimByesRaw from '$lib/fixtures/brackets/single-elim-byes.json';
	import fightCard4Raw from '$lib/fixtures/brackets/fight-card-4.json';
	import twoV2Raw from '$lib/fixtures/brackets/2v2-single-elim-8.json';

	const singleElim8 = singleElim8Raw as BracketData;
	const singleElimByes = singleElimByesRaw as BracketData;
	const fightCard4 = fightCard4Raw as BracketData;
	const twoV2 = twoV2Raw as BracketData;

	const allMatchesFrom = (data: BracketData): BracketMatch[] =>
		data.rounds.flatMap((r) => r.matches);

	const edgeCases: BracketMatch[] = [
		{
			id: 'ec-upcoming',
			round: 1,
			position: 1,
			isBye: false,
			status: 'upcoming',
			bestOf: 3,
			side1: { label: 'stabby', seed: 1, players: [{ name: 'stabby' }] },
			side2: { label: 'b4nny', seed: 2, players: [{ name: 'b4nny' }] },
		},
		{
			id: 'ec-live',
			round: 1,
			position: 2,
			isBye: false,
			status: 'live',
			bestOf: 3,
			side1: { label: 'sigafoo', seed: 3, score: 1, players: [{ name: 'sigafoo' }] },
			side2: { label: 'froyo', seed: 4, score: 1, players: [{ name: 'froyo' }] },
		},
		{
			id: 'ec-bye',
			round: 1,
			position: 3,
			isBye: true,
			status: 'completed',
			side1: {
				label: 'numlocked',
				seed: 5,
				isWinner: true,
				players: [{ name: 'numlocked' }],
			},
			side2: { label: 'BYE', isWinner: false },
		},
		{
			id: 'ec-2v2-upcoming',
			round: 1,
			position: 4,
			isBye: false,
			status: 'upcoming',
			bestOf: 3,
			side1: {
				label: 'Froyotech',
				seed: 1,
				players: [{ name: 'b4nny' }, { name: 'habib' }],
			},
			side2: {
				label: 'KND',
				seed: 2,
				players: [{ name: 'sigafoo' }, { name: 'marvel' }],
			},
		},
		{
			id: 'ec-no-href',
			round: 1,
			position: 5,
			isBye: false,
			status: 'completed',
			side1: { label: 'Player A', score: 2, isWinner: true },
			side2: { label: 'Player B', score: 0, isWinner: false },
		},
		{
			id: 'ec-grand-final',
			round: 3,
			position: 1,
			isBye: false,
			status: 'completed',
			bestOf: 5,
			label: 'Grand Final',
			href: '/matches/1',
			side1: {
				label: 'stabby',
				seed: 1,
				score: 3,
				isWinner: true,
				players: [{ name: 'stabby', steamId: '76561198012345678' }],
			},
			side2: {
				label: 'b4nny',
				seed: 2,
				score: 2,
				isWinner: false,
				players: [{ name: 'b4nny', steamId: '76561198011223344' }],
			},
		},
	];

	interface Section {
		title: string;
		matches: BracketMatch[];
	}

	const sections: Section[] = [
		{ title: 'Completed — 1v1 Single Elim', matches: allMatchesFrom(singleElim8) },
		{ title: 'Completed — Single Elim with BYEs', matches: allMatchesFrom(singleElimByes) },
		{ title: 'Completed — Fight Card', matches: allMatchesFrom(fightCard4) },
		{ title: 'Completed — 2v2 Single Elim', matches: allMatchesFrom(twoV2) },
		{ title: 'Edge Cases', matches: edgeCases },
	];
</script>

<div class="min-h-screen bg-surface-page p-8">
	<div class="max-w-7xl mx-auto space-y-12">
		<div>
			<h1 class="text-2xl font-bold text-text-heading">Bracket Component Dev Harness</h1>
			<p class="text-text-muted text-sm mt-1">
				Visual sandbox for <code class="text-text-label">MatchCard</code> and
				<code class="text-text-label">MatchSide</code> components.
			</p>
		</div>

		<section>
			<h2 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
				Single Elim — 8 Players
			</h2>
			<EliminationBracket data={singleElim8} />
		</section>

		<section>
			<h2 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
				Single Elim — BYEs
			</h2>
			<EliminationBracket data={singleElimByes} />
		</section>

		<hr class="border-border-default" />

		{#each sections as section}
			<section>
				<h2 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
					{section.title}
				</h2>
				<div class="flex flex-wrap gap-4">
					{#each section.matches as match (match.id)}
						<div class="w-56">
							<MatchCard {match} />
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
