<script lang="ts">
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

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onChange?.(value);
  }
</script>

<select
  {value}
  {disabled}
  onchange={handleChange}
  class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed {className}"
>
  {#if showAllOption}
    <option value="">{allLabel}</option>
  {/if}
  {#each options as opt}
    <option value={opt.value}>{opt.label}</option>
  {/each}
</select>
