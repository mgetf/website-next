<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Select } from 'bits-ui';
  import Check from '~icons/lucide/check';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronUp from '~icons/lucide/chevron-up';

  type MultiSelectItem = { value: string; label: string; disabled?: boolean };

  let {
    value = $bindable<string[]>([]),
    items,
    placeholder = 'Select…',
    disabled = false,
    name,
    id,
    error = false,
    size = 'md',
    overflowNoun = 'selected',
    onChange,
    onOpenChange,
    class: className = '',
    itemPrefix,
  }: {
    value?: string[];
    items: MultiSelectItem[];
    placeholder?: string;
    disabled?: boolean;
    name?: string;
    id?: string;
    error?: boolean;
    size?: 'md' | 'sm';
    overflowNoun?: string;
    onChange?: (value: string[]) => void;
    onOpenChange?: (open: boolean) => void;
    class?: string;
    itemPrefix?: Snippet<[MultiSelectItem]>;
  } = $props();

  let open = $state(false);
  const triggerId = $derived(id ?? name);

  const sizeClasses: Record<'md' | 'sm', string> = {
    md: 'px-4 py-3',
    sm: 'px-4 py-2',
  };

  const triggerClass = $derived(
    `flex w-full items-center justify-between ${sizeClasses[size]} bg-surface-input border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
      error ? 'border-danger-500' : 'border-border-input'
    } ${className}`.trim(),
  );

  const contentClass =
    'z-50 max-h-72 w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-lg border border-border-default bg-surface-card p-1 shadow-xl outline-none';
  const itemClass =
    'flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-label outline-none data-highlighted:bg-surface-input data-highlighted:text-white data-disabled:cursor-not-allowed data-disabled:opacity-50';

  const selectedItems = $derived(
    value.map((v) => items.find((item) => item.value === v)).filter((item) => item != null),
  );
  const singleSelected = $derived(selectedItems.length === 1 ? (selectedItems[0] ?? null) : null);

  function handleValueChange(next: string[]) {
    onChange?.(next);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange?.(next);
  }
</script>

<Select.Root
  type="multiple"
  {items}
  {disabled}
  {name}
  bind:value
  bind:open
  onValueChange={handleValueChange}
  onOpenChange={handleOpenChange}
>
  <Select.Trigger
    id={triggerId}
    class={triggerClass}
    aria-label={triggerId ? undefined : placeholder}
  >
    <span class="flex min-w-0 items-center gap-1.5 truncate">
      {#if selectedItems.length === 0}
        <span class="truncate text-text-muted">{placeholder}</span>
      {:else if singleSelected}
        {#if itemPrefix}
          {@render itemPrefix(singleSelected)}
        {/if}
        <span class="truncate">{singleSelected.label}</span>
      {:else if selectedItems.length <= 3}
        <span class="truncate">{selectedItems.map((item) => item.label).join(', ')}</span>
      {:else}
        <span class="truncate">{selectedItems.length} {overflowNoun}</span>
      {/if}
    </span>
    <ChevronDown
      class="ml-2 size-4 shrink-0 text-text-muted transition-transform {open ? 'rotate-180' : ''}"
    />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class={contentClass} sideOffset={6}>
      <Select.ScrollUpButton class="flex items-center justify-center py-1 text-text-muted">
        <ChevronUp class="size-4" />
      </Select.ScrollUpButton>
      <Select.Viewport>
        {#each items as item (item.value)}
          <Select.Item
            class={itemClass}
            value={item.value}
            label={item.label}
            disabled={item.disabled}
            data-value={item.value}
          >
            {#snippet children({ selected })}
              <span class="flex min-w-0 items-center gap-1.5">
                {#if itemPrefix}
                  {@render itemPrefix(item)}
                {/if}
                <span class="truncate">{item.label}</span>
              </span>
              {#if selected}
                <Check class="size-4 shrink-0 text-primary-400" />
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
      <Select.ScrollDownButton class="flex items-center justify-center py-1 text-text-muted">
        <ChevronDown class="size-4" />
      </Select.ScrollDownButton>
    </Select.Content>
  </Select.Portal>
</Select.Root>
