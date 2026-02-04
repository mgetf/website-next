<script lang="ts">
import type { Snippet } from 'svelte';
import Dialog from './Dialog.svelte';

type SubmitVariant = 'primary' | 'danger' | 'success';

interface Props {
	open: boolean;
	title: string;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	submitLabel?: string;
	cancelLabel?: string;
	submitVariant?: SubmitVariant;
	isSubmitting?: boolean;
	error?: string | null;
	onClose: () => void;
	children: Snippet;
}

let {
	open,
	title,
	maxWidth = 'md',
	submitLabel = 'Save',
	cancelLabel = 'Cancel',
	submitVariant = 'primary',
	isSubmitting = false,
	error = null,
	onClose,
	children
}: Props = $props();

const variantStyles: Record<SubmitVariant, string> = {
	primary: 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50',
	danger: 'bg-red-600 hover:bg-red-500 disabled:bg-red-600/50',
	success: 'bg-green-600 hover:bg-green-500 disabled:bg-green-600/50'
};
</script>

<Dialog {open} {title} {maxWidth} {onClose}>
	{#if error}
		<div class="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
			<p class="text-red-400 text-sm">{error}</p>
		</div>
	{/if}

	{@render children()}

	{#snippet footer()}
		<button
			type="button"
			onclick={onClose}
			disabled={isSubmitting}
			class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
		>
			{cancelLabel}
		</button>
		<button
			type="submit"
			disabled={isSubmitting}
			class="px-4 py-2 {variantStyles[submitVariant]} text-white rounded-lg transition-colors disabled:cursor-not-allowed"
		>
			{isSubmitting ? 'Saving...' : submitLabel}
		</button>
	{/snippet}
</Dialog>
