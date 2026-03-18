<script lang="ts">
  import type { Snippet } from 'svelte';

  type Color = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'zinc';
  type Size = 'sm' | 'md';

  interface Props {
    color?: Color;
    size?: Size;
    class?: string;
    children: Snippet;
  }

  let { color = 'zinc', size = 'sm', class: extraClass = '', children }: Props = $props();

  // Static lookup map required — Tailwind v4 does not support dynamic class interpolation.
  const colorClasses: Record<Color, string> = {
    green: 'bg-green-500/20 text-green-400 border border-green-500/30',
    red: 'bg-red-500/20 text-red-400 border border-red-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    orange: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    zinc: 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30',
  };

  const sizeClasses: Record<Size, string> = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };

  const base = 'inline-flex items-center rounded-full font-medium';
  const classes = $derived(
    `${base} ${sizeClasses[size]} ${colorClasses[color]} ${extraClass}`.trim(),
  );
</script>

<span class={classes}>
  {@render children()}
</span>
