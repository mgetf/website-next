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
    `w-full px-4 py-3 bg-zinc-800 border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      error ? 'border-red-500' : 'border-zinc-700'
    } ${className}`,
  );
</script>

<div class="mb-6">
  <label for={name} class="block text-sm font-medium text-gray-300 mb-2">
    {label}
    {#if required}
      <span class="text-red-500">*</span>
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
    <p class="text-xs text-gray-500 mt-1">{hint}</p>
  {/if}
  {#if error}
    <p class="text-xs text-red-400 mt-1">{error}</p>
  {/if}
</div>
