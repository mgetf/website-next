<script lang="ts">
import type { Snippet } from 'svelte';
import Dialog from './Dialog.svelte';

type ConfirmVariant = 'danger' | 'warning' | 'success' | 'info';

interface Props {
	open: boolean;
	title: string;
	description: string;
	confirmLabel?: string;
	loadingLabel?: string;
	cancelLabel?: string;
	variant?: ConfirmVariant;
	isLoading?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	preview?: Snippet;
}

let {
	open,
	title,
	description,
	confirmLabel = 'Confirm',
	loadingLabel,
	cancelLabel = 'Cancel',
	variant = 'danger',
	isLoading = false,
	onConfirm,
	onCancel,
	preview
}: Props = $props();

const variantStyles: Record<ConfirmVariant, { button: string; loading: string }> = {
	danger: {
		button: 'bg-red-600 hover:bg-red-500 disabled:bg-red-600/50',
		loading: 'Deleting...'
	},
	warning: {
		button: 'bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-600/50',
		loading: 'Processing...'
	},
	success: {
		button: 'bg-green-600 hover:bg-green-500 disabled:bg-green-600/50',
		loading: 'Processing...'
	},
	info: {
		button: 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50',
		loading: 'Processing...'
	}
};

const currentVariant = $derived(variantStyles[variant]);
</script>

<Dialog {open} {title} maxWidth="md" onClose={onCancel}>
	<p class="text-gray-400 mb-4">{description}</p>

	{#if preview}
		<div class="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
			{@render preview()}
		</div>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			onclick={onCancel}
			disabled={isLoading}
			class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
		>
			{cancelLabel}
		</button>
		<button
			type="button"
			onclick={onConfirm}
			disabled={isLoading}
			class="flex-1 px-4 py-2 {currentVariant.button} text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
		>
			{isLoading ? (loadingLabel ?? currentVariant.loading) : confirmLabel}
		</button>
	{/snippet}
</Dialog>
