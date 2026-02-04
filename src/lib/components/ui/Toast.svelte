<script lang="ts">
	import type { ToastType } from '$lib/state/toast.svelte';

	let {
		type,
		message,
		dismissible = true,
		onDismiss
	}: {
		type: ToastType;
		message: string;
		dismissible?: boolean;
		onDismiss?: () => void;
	} = $props();

	const typeStyles: Record<ToastType, { bg: string; text: string; icon: string }> = {
		success: {
			bg: 'bg-green-600',
			text: 'text-white',
			icon: '✓'
		},
		error: {
			bg: 'bg-red-600',
			text: 'text-white',
			icon: '✕'
		},
		info: {
			bg: 'bg-blue-600',
			text: 'text-white',
			icon: 'ℹ'
		},
		warning: {
			bg: 'bg-yellow-500',
			text: 'text-black',
			icon: '⚠'
		}
	};

	const style = $derived(typeStyles[type]);
</script>

<div
	class="flex items-start gap-3 px-4 py-3 {style.bg} rounded-lg shadow-lg max-w-sm animate-slide-up"
	role="alert"
>
	<span class="{style.text} text-lg flex-shrink-0">{style.icon}</span>
	<p class="{style.text} flex-1 text-sm font-medium">{message}</p>
	{#if dismissible && onDismiss}
		<button
			onclick={onDismiss}
			class="{style.text} opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
			aria-label="Dismiss notification"
		>
			✕
		</button>
	{/if}
</div>

<style>
	@keyframes slide-up {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	:global(.animate-slide-up) {
		animation: slide-up 0.3s ease-out;
	}
</style>
