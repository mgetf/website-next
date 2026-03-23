<script lang="ts">
  let {
    label,
    name,
    type = 'text',
    value = $bindable<string | null>(''),
    placeholder = '',
    required = false,
    disabled = false,
    maxlength,
    error,
    hint,
    class: className = '',
  }: {
    label: string;
    name: string;
    type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'number';
    value?: string | null;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    maxlength?: number;
    error?: string;
    hint?: string;
    class?: string;
  } = $props();

  const inputClasses = $derived(
    `w-full px-4 py-3 bg-surface-input border rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      error ? 'border-danger-500' : 'border-border-input'
    } ${className}`,
  );
</script>

<div class="mb-6">
  <label for={name} class="block text-sm font-medium text-text-label mb-2">
    {label}
    {#if required}
      <span class="text-danger-500">*</span>
    {/if}
  </label>
  <input
    {type}
    id={name}
    {name}
    bind:value
    {placeholder}
    {required}
    {disabled}
    {maxlength}
    class={inputClasses}
  />
  {#if hint && !error}
    <p class="text-xs text-text-muted mt-1">{hint}</p>
  {/if}
  {#if error}
    <p class="text-xs text-danger-400 mt-1">{error}</p>
  {/if}
</div>
