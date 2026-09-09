<script lang="ts">
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
    onChange,
    class: className = '',
  }: {
    value?: string;
    options: Option[];
    allLabel?: string;
    showAllOption?: boolean;
    disabled?: boolean;
    onChange?: (value: string) => void;
    class?: string;
  } = $props();

  const items = $derived(showAllOption ? [{ value: '', label: allLabel }, ...options] : options);
</script>

<SelectMenu
  bind:value
  {items}
  placeholder={allLabel}
  {disabled}
  size="sm"
  {onChange}
  class={className}
/>
