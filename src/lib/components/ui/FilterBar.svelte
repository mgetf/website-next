<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from './Button.svelte';

  let {
    onSubmit,
    onClear,
    hasActiveFilters = false,
    submitLabel = 'Search',
    class: className = '',
    filters,
  }: {
    onSubmit?: () => void;
    onClear?: () => void;
    hasActiveFilters?: boolean;
    submitLabel?: string;
    class?: string;
    filters: Snippet;
  } = $props();

  const showButtons = $derived(
    onSubmit !== undefined || (onClear !== undefined && hasActiveFilters),
  );

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSubmit?.();
  }
</script>

<div class="bg-surface-card border border-border-default rounded-lg p-6 mb-6 {className}">
  <form onsubmit={handleSubmit} class="flex flex-col gap-4">
    <div class="flex flex-col md:flex-row flex-wrap items-end gap-4">
      {@render filters()}
    </div>
    {#if showButtons}
      <div class="flex items-center gap-2">
        {#if onSubmit !== undefined}
          <Button type="submit" variant="primary">{submitLabel}</Button>
        {/if}
        {#if onClear !== undefined && hasActiveFilters}
          <Button type="button" variant="secondary" onclick={onClear}>Clear</Button>
        {/if}
      </div>
    {/if}
  </form>
</div>
