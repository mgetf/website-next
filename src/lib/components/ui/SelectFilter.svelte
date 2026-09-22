<script lang="ts">
  import type { Snippet } from 'svelte';
  import SelectMenu from '$lib/components/ui/SelectMenu.svelte';

  type Option = {
    value: string;
    label: string;
  };

  let {
    value = $bindable(''),
    options,
    allLabel = 'All',
    showAllOption = true,
    disabled = false,
    id,
    onChange,
    class: className = '',
    itemPrefix,
  }: {
    value?: string;
    options: Option[];
    allLabel?: string;
    showAllOption?: boolean;
    disabled?: boolean;
    id?: string;
    onChange?: (value: string) => void;
    class?: string;
    itemPrefix?: Snippet<[Option]>;
  } = $props();

  const items = $derived(showAllOption ? [{ value: '', label: allLabel }, ...options] : options);
</script>

<SelectMenu
  bind:value
  {items}
  placeholder={allLabel}
  {disabled}
  {id}
  size="sm"
  {onChange}
  class={className}
  {itemPrefix}
/>
