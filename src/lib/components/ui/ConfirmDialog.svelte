<script lang="ts">
  import type { Snippet } from 'svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

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
    preview,
  }: Props = $props();

  const variantButtonMap: Record<ConfirmVariant, 'danger' | 'warning' | 'success' | 'primary'> = {
    danger: 'danger',
    warning: 'warning',
    success: 'success',
    info: 'primary',
  };

  const variantLoadingText: Record<ConfirmVariant, string> = {
    danger: 'Deleting...',
    warning: 'Processing...',
    success: 'Processing...',
    info: 'Processing...',
  };

  const confirmButtonVariant = $derived(variantButtonMap[variant]);
  const loadingText = $derived(variantLoadingText[variant]);
</script>

<Dialog {open} {title} maxWidth="md" onClose={onCancel}>
  <p class="text-text-body mb-4">{description}</p>

  {#if preview}
    <div class="bg-surface-input border border-border-input rounded-lg p-4 mb-4">
      {@render preview()}
    </div>
  {/if}

  {#snippet footer()}
    <Button
      type="button"
      variant="secondary"
      onclick={onCancel}
      disabled={isLoading}
      class="flex-1"
    >
      {cancelLabel}
    </Button>
    <Button
      type="button"
      variant={confirmButtonVariant}
      onclick={onConfirm}
      disabled={isLoading}
      class="flex-1"
    >
      {isLoading ? (loadingLabel ?? loadingText) : confirmLabel}
    </Button>
  {/snippet}
</Dialog>
