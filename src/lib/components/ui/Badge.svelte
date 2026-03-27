<script lang="ts">
  import type { Snippet } from 'svelte';
  import Tooltip from './Tooltip.svelte';

  type Color = 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange' | 'zinc';
  type Size = 'sm' | 'md';

  interface Props {
    color?: Color;
    size?: Size;
    tooltip?: string;
    class?: string;
    children: Snippet;
  }

  let { color = 'zinc', size = 'sm', tooltip, class: extraClass = '', children }: Props = $props();

  // Static lookup map required — Tailwind v4 does not support dynamic class interpolation.
  const colorClasses: Record<Color, string> = {
    green: 'bg-success-500/20 text-success-400 border border-success-500/30',
    red: 'bg-danger-500/20 text-danger-400 border border-danger-500/30',
    yellow: 'bg-warning-500/20 text-warning-400 border border-warning-500/30',
    blue: 'bg-info-500/20 text-info-400 border border-info-500/30',
    purple: 'bg-format-1v1-500/20 text-format-1v1-400 border border-format-1v1-500/30',
    orange: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
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

{#if tooltip}
  <Tooltip text={tooltip}>
    <span class={classes}>
      {@render children()}
    </span>
  </Tooltip>
{:else}
  <span class={classes}>
    {@render children()}
  </span>
{/if}
