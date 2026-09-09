<script lang="ts">
  import { Select } from 'bits-ui';
  import Check from '~icons/lucide/check';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronUp from '~icons/lucide/chevron-up';

  type SelectMenuItem = { value: string; label: string; disabled?: boolean };

  let {
    value = $bindable(''),
    items,
    placeholder = 'Select an option',
    disabled = false,
    required = false,
    name,
    id,
    error = false,
    size = 'md',
    onChange,
    class: className = '',
  }: {
    value?: string;
    items: SelectMenuItem[];
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    id?: string;
    error?: boolean;
    size?: 'md' | 'sm';
    onChange?: (value: string) => void;
    class?: string;
  } = $props();

  let open = $state(false);
  const triggerId = $derived(id ?? name);

  const sizeClasses: Record<'md' | 'sm', string> = {
    md: 'px-4 py-3',
    sm: 'px-4 py-2',
  };

  const triggerClass = $derived(
    `flex w-full items-center justify-between ${sizeClasses[size]} bg-surface-input border rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed data-placeholder:text-text-muted ${
      error ? 'border-danger-500' : 'border-border-input'
    } ${className}`.trim(),
  );

  const contentClass =
    'z-50 max-h-72 w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-lg border border-border-default bg-surface-card p-1 shadow-xl outline-none';
  const itemClass =
    'flex cursor-pointer select-none items-center justify-between gap-2 rounded-md px-3 py-2 text-sm text-text-label outline-none data-highlighted:bg-surface-input data-highlighted:text-white data-disabled:cursor-not-allowed data-disabled:opacity-50';

  function handleValueChange(next: string) {
    onChange?.(next);
  }
</script>

<Select.Root
  type="single"
  {items}
  {disabled}
  {name}
  {required}
  allowDeselect={!required}
  bind:value={value as never}
  bind:open
  onValueChange={handleValueChange}
>
  <Select.Trigger
    id={triggerId}
    class={triggerClass}
    aria-label={triggerId ? undefined : placeholder}
  >
    <Select.Value class="truncate" {placeholder} />
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
              <span>{item.label}</span>
              {#if selected}
                <Check class="size-4 text-primary-400" />
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
