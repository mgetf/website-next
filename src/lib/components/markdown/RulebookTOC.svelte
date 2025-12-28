<script lang="ts">
	import Fuse from 'fuse.js';

	interface TOCItem {
		id: string;
		text: string;
		level: number;
	}

	interface Props {
		items: TOCItem[];
		activeId?: string;
	}

	let { items, activeId = '' }: Props = $props();

	let searchQuery = $state('');
	let isCollapsed = $state(false);

	// Create Fuse instance for fuzzy search
	const fuse = $derived(
		new Fuse(items, {
			keys: ['text'],
			threshold: 0.4,
			includeScore: true
		})
	);

	// Filter items based on search
	const filteredItems = $derived(() => {
		if (!searchQuery.trim()) return items;
		const results = fuse.search(searchQuery);
		return results.map((r) => r.item);
	});

	function scrollToSection(id: string) {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function getIndentClass(level: number): string {
		switch (level) {
			case 1:
				return '';
			case 2:
				return 'pl-3';
			case 3:
				return 'pl-6';
			case 4:
				return 'pl-9';
			default:
				return 'pl-12';
		}
	}

	function getFontClass(level: number): string {
		switch (level) {
			case 1:
				return 'font-bold text-white';
			case 2:
				return 'font-semibold text-gray-200';
			default:
				return 'font-normal text-gray-400';
		}
	}
</script>

<div class="toc-container bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
	<!-- Header -->
	<div class="p-4 border-b border-zinc-800 flex items-center justify-between">
		<h3 class="font-bold text-white">Table of Contents</h3>
		<button
			onclick={() => (isCollapsed = !isCollapsed)}
			class="lg:hidden p-1 hover:bg-zinc-800 rounded transition"
			aria-label={isCollapsed ? 'Expand' : 'Collapse'}
		>
			<svg
				class="w-5 h-5 text-gray-400 transition-transform {isCollapsed ? 'rotate-180' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
			</svg>
		</button>
	</div>

	<!-- Search -->
	<div class="p-3 border-b border-zinc-800 {isCollapsed ? 'hidden lg:block' : ''}">
		<div class="relative">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search..."
				class="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pl-9 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
			/>
			<svg
				class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>
	</div>

	<!-- TOC List -->
	<nav
		class="p-3 max-h-[60vh] overflow-y-auto {isCollapsed ? 'hidden lg:block' : ''}"
		aria-label="Table of contents"
	>
		{#if filteredItems().length === 0}
			<p class="text-gray-500 text-sm text-center py-4">No results found</p>
		{:else}
			<ul class="space-y-1">
				{#each filteredItems() as item}
					<li>
						<button
							onclick={() => scrollToSection(item.id)}
							class="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-zinc-800 transition-colors {getIndentClass(
								item.level
							)} {getFontClass(item.level)} {activeId === item.id
								? 'bg-blue-500/20 text-blue-400'
								: ''}"
						>
							{item.text}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</nav>
</div>

