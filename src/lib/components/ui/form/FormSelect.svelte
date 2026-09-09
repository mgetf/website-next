<script lang="ts">
  import SelectMenu from '$lib/components/ui/SelectMenu.svelte';

  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  let {
    label,
    name,
    id,
    value = $bindable(''),
    options,
    placeholder = 'Select an option',
    required = false,
    disabled = false,
    error,
    hint,
    hintVariant = 'default',
    onChange,
    class: className = '',
  }: {
    label: string;
    name: string;
    id?: string;
    value?: string;
    options: Option[];
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    error?: string;
    hint?: string;
    hintVariant?: 'default' | 'warning';
    onChange?: (value: string) => void;
    class?: string;
  } = $props();

  const triggerId = $derived(id ?? name);
</script>

<div class="mb-6">
  <label for={triggerId} class="block text-sm font-medium text-text-label mb-2">
    {label}
    {#if required}
      <span class="text-danger-500">*</span>
    {/if}
  </label>
  <SelectMenu
    {name}
    id={triggerId}
    bind:value
    items={options}
    {placeholder}
    {required}
    {disabled}
    error={!!error}
    {onChange}
    class={className}
  />
  {#if hint && !error}
    <p
      class={hintVariant === 'warning'
        ? 'text-xs font-semibold text-warning-400/90 mt-1.5'
        : 'text-xs text-text-muted mt-1'}
    >
      {hint}
    </p>
  {/if}
  {#if error}
    <p class="text-xs text-danger-400 mt-1">{error}</p>
  {/if}
</div>
