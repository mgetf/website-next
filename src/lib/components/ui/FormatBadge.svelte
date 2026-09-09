<script lang="ts">
  import { getFormatThemeClasses } from '$lib/constants/formats';

  type Size = 'sm' | 'md';

  type Props = {
    name: string;
    themeKey?: string | null;
    size?: Size;
    class?: string;
  };

  let { name, themeKey, size = 'sm', class: extraClass = '' }: Props = $props();

  const theme = $derived(getFormatThemeClasses(themeKey));
  const sizeClasses: Record<Size, string> = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  };
</script>

<span
  class="inline-flex items-center rounded-full font-medium {sizeClasses[
    size
  ]} {theme.badge} {extraClass}">{name}</span
>
