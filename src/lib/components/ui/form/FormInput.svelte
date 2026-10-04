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
    min,
    max,
    step,
    error,
    hint,
    onInput,
    compact = false,
    class: className = '',
  }: {
    label: string;
    name: string;
    type?: 'text' | 'email' | 'password' | 'url' | 'tel' | 'number' | 'datetime-local';
    value?: string | null;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    maxlength?: number;
    min?: string | number;
    max?: string | number;
    step?: string | number;
    error?: string;
    hint?: string;
    onInput?: (value: string | null) => void;
    compact?: boolean;
    class?: string;
  } = $props();

  const inputClasses = $derived(
    `w-full bg-surface-input border rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-3'
    } ${error ? 'border-danger-500' : 'border-border-input'} ${className}`,
  );

  function handleInput(event: Event) {
    value = (event.currentTarget as HTMLInputElement).value;
    onInput?.(value);
  }
</script>

<div class={compact ? '' : 'mb-6'}>
  <label
    for={name}
    class="block font-medium text-text-label {compact ? 'mb-1 text-xs' : 'mb-2 text-sm'}"
  >
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
    {min}
    {max}
    {step}
    oninput={handleInput}
    class={inputClasses}
  />
  {#if hint && !error}
    <p class="text-xs text-text-muted mt-1">{hint}</p>
  {/if}
  {#if error}
    <p class="text-xs text-danger-400 mt-1">{error}</p>
  {/if}
</div>
