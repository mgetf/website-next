<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Tooltip as BitsTooltip } from 'bits-ui';

  interface Props {
    text?: string;
    content?: Snippet;
    children: Snippet;
  }

  let { text, content, children }: Props = $props();
</script>

<BitsTooltip.Root delayDuration={200}>
  <BitsTooltip.Trigger>
    {#snippet child({ props })}
      <span {...props} class="inline-flex">
        {@render children()}
      </span>
    {/snippet}
  </BitsTooltip.Trigger>
  <BitsTooltip.Portal>
    <BitsTooltip.Content
      side="top"
      sideOffset={8}
      class={content
        ? 'z-50 max-w-xs rounded-lg border border-border-default bg-surface-card px-3 py-2.5 text-left shadow-lg'
        : 'z-50 rounded border border-border-default bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-white shadow-lg'}
    >
      {#if content}
        {@render content()}
      {:else}
        {text}
      {/if}
    </BitsTooltip.Content>
  </BitsTooltip.Portal>
</BitsTooltip.Root>
