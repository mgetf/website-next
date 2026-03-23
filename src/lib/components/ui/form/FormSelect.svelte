<script lang="ts">
  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  let {
    label,
    name,
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

  const selectClasses = $derived(
    `w-full px-4 py-3 bg-surface-input border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      error ? 'border-danger-500' : 'border-border-input'
    } ${className}`,
  );

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onChange?.(value);
  }
</script>

<div class="mb-6">
  <label for={name} class="block text-sm font-medium text-text-label mb-2">
    {label}
    {#if required}
      <span class="text-danger-500">*</span>
    {/if}
  </label>
  <select
    id={name}
    {name}
    {value}
    {required}
    {disabled}
    onchange={handleChange}
    class={selectClasses}
  >
    <option value="" disabled={required}>{placeholder}</option>
    {#each options as opt}
      <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
    {/each}
  </select>
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
