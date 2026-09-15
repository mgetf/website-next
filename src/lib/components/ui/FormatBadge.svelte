<script lang="ts">
  import { getFormatThemeClasses } from '$lib/constants/formats';
  import FormatIcon from '$lib/components/ui/FormatIcon.svelte';

  type Size = 'sm' | 'md';

  type Props = {
    name: string;
    themeKey?: string | null;
    iconUrl?: string | null;
    size?: Size;
    class?: string;
  };

  let { name, themeKey, iconUrl = null, size = 'sm', class: extraClass = '' }: Props = $props();

  const theme = $derived(getFormatThemeClasses(themeKey));
  const sizeClasses: Record<Size, string> = {
    sm: 'gap-1 px-2 py-0.5 text-xs',
    md: 'gap-1.5 px-3 py-1 text-sm',
  };
  const iconSize = $derived(size === 'md' ? 'md' : 'sm');
</script>

<span
  class="inline-flex items-center rounded-full font-medium {sizeClasses[
    size
  ]} {theme.badge} {extraClass}"
>
  <FormatIcon {name} src={iconUrl} size={iconSize} />
  {name}
</span>
