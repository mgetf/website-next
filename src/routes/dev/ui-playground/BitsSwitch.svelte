<script lang="ts">
  import { Label, Switch } from 'bits-ui';

  let {
    checked = $bindable(false),
    label,
    name,
    disabled = false,
    id = 'bits-switch',
  }: {
    checked?: boolean;
    label: string;
    name?: string;
    disabled?: boolean;
    id?: string;
  } = $props();
</script>

<div class="flex items-center gap-3">
  <Switch.Root
    {id}
    {name}
    {disabled}
    bind:checked
    class="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border-input bg-surface-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 data-[state=checked]:border-primary-600 data-[state=checked]:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <Switch.Thumb
      class="block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[1.25rem] data-[state=unchecked]:translate-x-0.5"
    />
  </Switch.Root>
  <Label.Root for={id} class="text-sm font-medium text-text-label">
    {label}
  </Label.Root>
</div>
