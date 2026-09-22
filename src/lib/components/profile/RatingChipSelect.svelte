<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Select } from 'bits-ui';
  import Check from '~icons/lucide/check';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronUp from '~icons/lucide/chevron-up';

  type Item = { value: string; label: string };

  let {
    value,
    items,
    ariaLabel,
    onChange,
    itemPrefix,
  }: {
    value: string;
    items: Item[];
    ariaLabel: string;
    onChange: (value: string) => void;
    itemPrefix?: Snippet<[Item]>;
  } = $props();

  let open = $state(false);
  const selected = $derived(items.find((item) => item.value === value) ?? null);

  const contentClass =
    'z-50 max-h-72 min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-lg border border-border-default bg-surface-card p-1 shadow-xl outline-none';
  const itemClass =
    'flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs text-text-label outline-none data-highlighted:bg-surface-input data-highlighted:text-white';
</script>

<Select.Root
  type="single"
  {items}
  value={value as never}
  allowDeselect={false}
  bind:open
  onValueChange={(next) => onChange(next)}
>
  <Select.Trigger
    aria-label={ariaLabel}
    class="inline-flex items-center gap-1.5 rounded-lg border border-primary-500 bg-primary-500/15 px-2.5 py-1 text-xs font-medium text-white"
  >
    {#if selected}
      {#if itemPrefix}
        {@render itemPrefix(selected)}
      {/if}
      <span>{selected.label}</span>
    {/if}
    <ChevronDown
      class="size-3 shrink-0 opacity-70 transition-transform {open ? 'rotate-180' : ''}"
    />
  </Select.Trigger>
  <Select.Portal>
    <Select.Content class={contentClass} sideOffset={6}>
      <Select.ScrollUpButton class="flex items-center justify-center py-1 text-text-muted">
        <ChevronUp class="size-3" />
      </Select.ScrollUpButton>
      <Select.Viewport>
        {#each items as item (item.value)}
          <Select.Item class={itemClass} value={item.value} label={item.label}>
            {#snippet children({ selected: isSelected })}
              <span class="flex min-w-0 items-center gap-1.5">
                {#if itemPrefix}
                  {@render itemPrefix(item)}
                {/if}
                <span class="truncate">{item.label}</span>
              </span>
              {#if isSelected}
                <Check class="size-3.5 shrink-0 text-primary-400" />
              {/if}
            {/snippet}
          </Select.Item>
        {/each}
      </Select.Viewport>
      <Select.ScrollDownButton class="flex items-center justify-center py-1 text-text-muted">
        <ChevronDown class="size-3" />
      </Select.ScrollDownButton>
    </Select.Content>
  </Select.Portal>
</Select.Root>
