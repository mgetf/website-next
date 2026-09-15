<script lang="ts">
  type Size = 'sm' | 'md' | 'lg' | 'xl';

  type Props = {
    name: string;
    src?: string | null;
    size?: Size;
    class?: string;
  };

  let { name, src = null, size = 'sm', class: extraClass = '' }: Props = $props();

  const sizeClasses: Record<Size, string> = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-8 w-8',
    xl: 'h-14 w-14',
  };
</script>

{#if src}
  <img {src} alt="" title={name} class="shrink-0 object-contain {sizeClasses[size]} {extraClass}" />
{/if}
