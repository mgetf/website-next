<script lang="ts">
	import type { BracketMatch } from '$lib/types/bracket';
	import Badge from '$lib/components/ui/Badge.svelte';
	import MatchSide from './MatchSide.svelte';

	interface Props {
		match: BracketMatch;
	}

	let { match }: Props = $props();

	const isLive = $derived(match.status === 'live');
	const showMetaRow = $derived(
		match.bestOf !== undefined || match.label !== undefined || isLive
	);

	const isSide1Bye = $derived(match.isBye && match.side1.label === 'BYE' && !match.side1.players?.length);
	const isSide2Bye = $derived(match.isBye && match.side2.label === 'BYE' && !match.side2.players?.length);

	const containerClasses = $derived([
		'bg-surface-card border rounded-lg overflow-hidden transition-colors',
		isLive ? 'border-primary-500' : 'border-border-default',
		match.isBye ? 'opacity-60' : '',
		match.href ? 'hover:border-border-input cursor-pointer' : '',
	].filter(Boolean).join(' '));
</script>

{#if match.href}
	<a href={match.href} class={containerClasses}>
		{#if showMetaRow}
			<div class="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-surface-input/40">
				{#if match.bestOf !== undefined}
					<Badge color="zinc" size="sm">Bo{match.bestOf}</Badge>
				{/if}

				{#if match.label}
					<span class="text-xs text-text-muted font-medium truncate flex-1">{match.label}</span>
				{:else}
					<span class="flex-1"></span>
				{/if}

				{#if isLive}
					<span class="flex items-center gap-1 text-primary-400 text-xs font-medium shrink-0">
						<span class="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
						LIVE
					</span>
				{/if}
			</div>
		{/if}

		<MatchSide side={match.side1} matchStatus={match.status} isByeSide={isSide1Bye} />
		<div class="border-t border-border-default"></div>
		<MatchSide side={match.side2} matchStatus={match.status} isByeSide={isSide2Bye} />
	</a>
{:else}
	<div class={containerClasses}>
		{#if showMetaRow}
			<div class="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-surface-input/40">
				{#if match.bestOf !== undefined}
					<Badge color="zinc" size="sm">Bo{match.bestOf}</Badge>
				{/if}

				{#if match.label}
					<span class="text-xs text-text-muted font-medium truncate flex-1">{match.label}</span>
				{:else}
					<span class="flex-1"></span>
				{/if}

				{#if isLive}
					<span class="flex items-center gap-1 text-primary-400 text-xs font-medium shrink-0">
						<span class="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse"></span>
						LIVE
					</span>
				{/if}
			</div>
		{/if}

		<MatchSide side={match.side1} matchStatus={match.status} isByeSide={isSide1Bye} />
		<div class="border-t border-border-default"></div>
		<MatchSide side={match.side2} matchStatus={match.status} isByeSide={isSide2Bye} />
	</div>
{/if}
