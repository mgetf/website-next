<script lang="ts">
  let {
    value = $bindable(''),
    placeholder = 'Search...',
    onSearch,
    debounceMs = 0,
    class: className = '',
  }: {
    value?: string;
    placeholder?: string;
    onSearch?: (value: string) => void;
    debounceMs?: number;
    class?: string;
  } = $props();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = target.value;

    if (onSearch) {
      if (debounceMs > 0) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          onSearch(value);
        }, debounceMs);
      } else {
        onSearch(value);
      }
    }
  }
</script>

<input
  type="text"
  {value}
  {placeholder}
  oninput={handleInput}
  class="w-full px-4 py-2 bg-surface-input border border-border-input rounded-lg text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors {className}"
/>
