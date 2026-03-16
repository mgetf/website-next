<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		onSubmit,
		onClear,
		hasActiveFilters = false,
		submitLabel = 'Search',
		class: className = '',
		filters,
	}: {
		onSubmit?: () => void;
		onClear?: () => void;
		hasActiveFilters?: boolean;
		submitLabel?: string;
		class?: string;
		filters: Snippet;
	} = $props();

	const showButtons = $derived(onSubmit !== undefined || (onClear !== undefined && hasActiveFilters));

	function handleSubmit(e: Event) {
		e.preventDefault();
		onSubmit?.();
	}
</script>

<div class="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-6 {className}">
	<form onsubmit={handleSubmit} class="flex flex-col gap-4">
		<div class="flex flex-col md:flex-row flex-wrap items-end gap-4">
			{@render filters()}
		</div>
		{#if showButtons}
			<div class="flex items-center gap-2">
				{#if onSubmit !== undefined}
					<button
						type="submit"
						class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
					>
						{submitLabel}
					</button>
				{/if}
				{#if onClear !== undefined && hasActiveFilters}
					<button
						type="button"
						onclick={onClear}
						class="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-lg transition-colors"
					>
						Clear
					</button>
				{/if}
			</div>
		{/if}
	</form>
</div>
