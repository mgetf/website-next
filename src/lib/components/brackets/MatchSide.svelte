<script lang="ts">
	import type { BracketSide, MatchStatus } from '$lib/types/bracket';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		side: BracketSide;
		matchStatus: MatchStatus;
		isByeSide: boolean;
	}

	let { side, matchStatus, isByeSide }: Props = $props();

	const players = $derived(side.players ?? []);
	const hasPlayers = $derived(players.length > 0);
	const is2v2 = $derived(players.length === 2);

	const isCompleted = $derived(matchStatus === 'completed');
	const isWinner = $derived(isCompleted && side.isWinner === true);
	const isLoser = $derived(isCompleted && side.isWinner === false);

	const nameClasses = $derived(
		isByeSide
			? 'text-text-muted italic text-sm'
			: isWinner
				? 'text-text-heading font-semibold text-sm'
				: isLoser
					? 'text-text-muted text-sm'
					: 'text-text-label text-sm'
	);

	const scoreClasses = $derived(
		isWinner
			? 'text-success-400 font-bold text-sm tabular-nums'
			: isLoser
				? 'text-danger-400 text-sm tabular-nums'
				: 'text-text-muted text-sm tabular-nums'
	);

	const showScore = $derived(!isByeSide && isCompleted && side.score !== undefined);
</script>

<div class="flex items-center gap-2 px-3 py-2 min-w-0">
	{#if side.seed !== undefined}
		<Badge color="zinc" size="sm">{side.seed}</Badge>
	{/if}

	{#if hasPlayers && !isByeSide}
		{#if is2v2}
			<div class="flex shrink-0">
				{#each players as player, i}
					{#if player.href}
						<a href={player.href} class="block {i > 0 ? '-ml-2' : ''} ring-1 ring-surface-card rounded-full">
							{#if player.avatarUrl}
								<img
									src={player.avatarUrl}
									alt={player.name}
									class="w-5 h-5 rounded-full object-cover"
								/>
							{:else}
								<div class="w-5 h-5 rounded-full bg-surface-input flex items-center justify-center text-text-muted text-[10px] font-medium">
									{player.name.charAt(0).toUpperCase()}
								</div>
							{/if}
						</a>
					{:else}
						<div class="{i > 0 ? '-ml-2' : ''} ring-1 ring-surface-card rounded-full">
							{#if player.avatarUrl}
								<img
									src={player.avatarUrl}
									alt={player.name}
									class="w-5 h-5 rounded-full object-cover"
								/>
							{:else}
								<div class="w-5 h-5 rounded-full bg-surface-input flex items-center justify-center text-text-muted text-[10px] font-medium">
									{player.name.charAt(0).toUpperCase()}
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{:else}
			{@const player = players[0]}
			{#if player.href}
				<a href={player.href} class="shrink-0">
					{#if player.avatarUrl}
						<img
							src={player.avatarUrl}
							alt={player.name}
							class="w-6 h-6 rounded-full object-cover"
						/>
					{:else}
						<div class="w-6 h-6 rounded-full bg-surface-input flex items-center justify-center text-text-muted text-xs font-medium">
							{player.name.charAt(0).toUpperCase()}
						</div>
					{/if}
				</a>
			{:else}
				<div class="shrink-0">
					{#if player.avatarUrl}
						<img
							src={player.avatarUrl}
							alt={player.name}
							class="w-6 h-6 rounded-full object-cover"
						/>
					{:else}
						<div class="w-6 h-6 rounded-full bg-surface-input flex items-center justify-center text-text-muted text-xs font-medium">
							{player.name.charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	{/if}

	<span class="flex-1 truncate {nameClasses}">
		{side.label}
	</span>

	{#if showScore}
		<span class={scoreClasses}>{side.score}</span>
	{:else if !isByeSide && !isCompleted}
		<span class="text-text-muted text-sm tabular-nums">—</span>
	{/if}
</div>
