<script lang="ts">
  import { Checkbox, Label } from 'bits-ui';
  import Check from '~icons/lucide/check';
  import Minus from '~icons/lucide/minus';

  let {
    checked = $bindable(false),
    indeterminate = $bindable(false),
    label,
    name,
    disabled = false,
    id = 'bits-checkbox',
  }: {
    checked?: boolean;
    indeterminate?: boolean;
    label: string;
    name?: string;
    disabled?: boolean;
    id?: string;
  } = $props();
</script>

<div class="flex items-center gap-3">
  <Checkbox.Root
    {id}
    {name}
    {disabled}
    bind:checked
    bind:indeterminate
    class="inline-flex size-5 shrink-0 items-center justify-center rounded border border-border-input bg-surface-input text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 data-[state=checked]:border-primary-600 data-[state=checked]:bg-primary-600 data-[state=indeterminate]:border-primary-600 data-[state=indeterminate]:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {#snippet children({ checked, indeterminate })}
      {#if indeterminate}
        <Minus class="size-3.5" />
      {:else if checked}
        <Check class="size-3.5" />
      {/if}
    {/snippet}
  </Checkbox.Root>
  <Label.Root for={id} class="text-sm font-medium text-text-label">
    {label}
  </Label.Root>
</div>
