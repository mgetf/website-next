<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Tooltip as BitsTooltip } from 'bits-ui';

  interface Props {
    text: string;
    children: Snippet;
  }

  let { text, children }: Props = $props();
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
      class="z-50 rounded border border-border-default bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
    >
      {text}
    </BitsTooltip.Content>
  </BitsTooltip.Portal>
</BitsTooltip.Root>
