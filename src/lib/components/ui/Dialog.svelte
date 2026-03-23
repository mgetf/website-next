<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  }

  let { open, title, maxWidth = 'md', onClose, children, footer }: Props = $props();

  const maxWidthClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  function handleBackdropClick() {
    onClose();
  }

  function handleDialogClick(e: MouseEvent) {
    e.stopPropagation();
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={handleBackdropClick}
    role="button"
    tabindex="-1"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="bg-surface-card border border-border-default rounded-lg p-6 w-full {maxWidthClasses[
        maxWidth
      ]} max-h-[90vh] overflow-y-auto"
      onclick={handleDialogClick}
      role="dialog"
      aria-modal="true"
      tabindex="-1"
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-bold text-white">{title}</h3>
        <button
          type="button"
          onclick={onClose}
          class="text-text-body hover:text-white transition-colors"
          aria-label="Close dialog"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div>
        {@render children()}
      </div>

      {#if footer}
        <div class="mt-6 flex gap-3 justify-end">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
