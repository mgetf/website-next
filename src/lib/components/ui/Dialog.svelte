<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Dialog as BitsDialog } from 'bits-ui';
  import X from '~icons/lucide/x';

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

  function getOpen() {
    return open;
  }

  function setOpen(next: boolean) {
    if (!next) onClose();
  }
</script>

<BitsDialog.Root bind:open={getOpen, setOpen}>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <BitsDialog.Content
      class="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] {maxWidthClasses[
        maxWidth
      ]} max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border-default bg-surface-card p-6 outline-none"
    >
      <div class="mb-4 flex items-center justify-between">
        <BitsDialog.Title level={3} class="text-xl font-bold text-white">{title}</BitsDialog.Title>
        <BitsDialog.Close
          class="text-text-body transition-colors hover:text-white"
          aria-label="Close dialog"
        >
          <X class="size-5" />
        </BitsDialog.Close>
      </div>

      <div>
        {@render children()}
      </div>

      {#if footer}
        <div class="mt-6 flex justify-end gap-3">
          {@render footer()}
        </div>
      {/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>
