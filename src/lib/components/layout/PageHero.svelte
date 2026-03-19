<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    title?: string;
    subtitle?: string;
    maxWidth?: string;
    border?: boolean;
    class?: string;
    children?: Snippet;
  };

  let {
    title,
    subtitle,
    maxWidth = 'max-w-6xl',
    border = false,
    class: extraClass = '',
    children,
  }: Props = $props();
</script>

<section
  class="relative py-12 px-6 bg-gradient-to-b from-zinc-950/80 to-zinc-900/60 backdrop-blur-sm{border
    ? ' border-b border-zinc-800'
    : ''} {extraClass}"
>
  <div class="{maxWidth} mx-auto">
    {#if children}
      {@render children()}
    {:else}
      <h1 class="text-5xl font-black text-white mb-2">{title}</h1>
      {#if subtitle}
        <p class="text-xl text-gray-400">{subtitle}</p>
      {/if}
    {/if}
  </div>
</section>
