<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

  type Variant =
    | 'primary'
    | 'secondary'
    | 'danger'
    | 'success'
    | 'warning'
    | 'ghost'
    | 'format-2v2'
    | 'format-1v1';
  type Size = 'sm' | 'md' | 'lg';

  interface BaseProps {
    variant?: Variant;
    size?: Size;
    children: Snippet;
    class?: string;
  }

  interface ButtonProps extends BaseProps, Omit<HTMLButtonAttributes, 'class' | 'children'> {
    href?: undefined;
    type?: 'button' | 'submit' | 'reset';
  }

  interface AnchorProps extends BaseProps, Omit<HTMLAnchorAttributes, 'class' | 'children'> {
    href: string;
  }

  type Props = ButtonProps | AnchorProps;

  let {
    variant = 'primary',
    size = 'md',
    children,
    class: extraClass = '',
    href,
    ...rest
  }: Props = $props();

  const variantClasses: Record<Variant, string> = {
    primary:
      'bg-primary-700 hover:bg-primary-600 text-white disabled:bg-primary-700/50 disabled:cursor-not-allowed',
    secondary:
      'bg-surface-input hover:bg-surface-hover text-text-label disabled:opacity-50 disabled:cursor-not-allowed',
    danger:
      'bg-danger-800 hover:bg-danger-700 text-white disabled:bg-danger-800/50 disabled:cursor-not-allowed',
    success:
      'bg-success-700 hover:bg-success-600 text-white disabled:bg-success-700/50 disabled:cursor-not-allowed',
    warning:
      'bg-warning-600 hover:bg-warning-500 text-white disabled:bg-warning-600/50 disabled:cursor-not-allowed',
    ghost:
      'bg-transparent hover:bg-surface-input text-text-body disabled:opacity-50 disabled:cursor-not-allowed',
    'format-2v2':
      'bg-theme-blue-600 hover:bg-theme-blue-500 text-white disabled:bg-theme-blue-600/50 disabled:cursor-not-allowed',
    'format-1v1':
      'bg-theme-purple-600 hover:bg-theme-purple-500 text-white disabled:bg-theme-purple-600/50 disabled:cursor-not-allowed',
  };

  const sizeClasses: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-base',
  };

  const base = 'rounded-lg font-medium transition-colors';
  const classes = $derived(
    `${base} ${sizeClasses[size]} ${variantClasses[variant]} ${extraClass}`.trim(),
  );
</script>

{#if href}
  <a
    {href}
    class={classes}
    {...rest as Omit<AnchorProps, 'href' | 'variant' | 'size' | 'children' | 'class'>}
  >
    {@render children()}
  </a>
{:else}
  <button class={classes} {...rest as Omit<ButtonProps, 'variant' | 'size' | 'children' | 'class'>}>
    {@render children()}
  </button>
{/if}
