<script lang="ts">
  import type { Snippet } from 'svelte';

  type Padding = 'none' | 'sm' | 'md' | 'lg';

  interface Props {
    padding?: Padding;
    class?: string;
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }

  let { padding = 'md', class: extraClass = '', children, header, footer }: Props = $props();

  const paddingClasses: Record<Padding, string> = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  const base = 'bg-surface-card border border-border-default rounded-lg';
  const classes = $derived(`${base} ${extraClass}`.trim());
  const contentPadding = $derived(paddingClasses[padding]);
</script>

<div class={classes}>
  {#if header}
    <div class="border-b border-border-default {contentPadding}">
      {@render header()}
    </div>
  {/if}

  <div class={contentPadding}>
    {@render children()}
  </div>

  {#if footer}
    <div class="border-t border-border-default {contentPadding}">
      {@render footer()}
    </div>
  {/if}
</div>
