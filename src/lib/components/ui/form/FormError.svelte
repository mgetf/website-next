<script lang="ts">
	let {
		error,
		success,
		variant = 'inline'
	}: {
		error?: string | null;
		success?: string | null;
		variant?: 'inline' | 'toast';
	} = $props();

	const hasMessage = $derived(!!error || !!success);
	const isError = $derived(!!error);

	const baseClasses = 'p-4 rounded-lg';
	const variantClasses = $derived(
		variant === 'toast' ? 'fixed top-4 right-4 shadow-lg z-50' : 'mb-6'
	);
	const colorClasses = $derived(
		isError
			? 'bg-red-500/20 border border-red-500/50'
			: 'bg-green-500/20 border border-green-500/50'
	);
	const textClasses = $derived(isError ? 'text-red-400' : 'text-green-400');
</script>

{#if hasMessage}
	<div class="{baseClasses} {variantClasses} {colorClasses}">
		<p class={textClasses}>{error || success}</p>
	</div>
{/if}
