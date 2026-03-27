<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    text: string;
    children: Snippet;
  }

  let { text, children }: Props = $props();
</script>

<span class="group relative inline-flex">
  {@render children()}
  <span
    role="tooltip"
    class="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded bg-surface-hover px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 border border-border-default z-50"
  >
    {text}
  </span>
</span>
