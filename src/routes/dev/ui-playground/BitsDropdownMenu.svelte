<script lang="ts">
  import { DropdownMenu } from 'bits-ui';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronRight from '~icons/lucide/chevron-right';
  import LogOut from '~icons/lucide/log-out';
  import Settings from '~icons/lucide/settings';
  import User from '~icons/lucide/user';
  import Users from '~icons/lucide/users';

  let { lastAction = $bindable('') }: { lastAction?: string } = $props();

  const triggerClass =
    'inline-flex items-center gap-2 rounded-lg bg-surface-input px-4 py-2 text-sm font-medium text-text-label transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
  const contentClass =
    'z-50 min-w-52 rounded-lg border border-border-default bg-surface-card p-1 shadow-xl outline-none';
  const itemClass =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-text-label outline-none data-highlighted:bg-surface-input data-highlighted:text-white data-disabled:cursor-not-allowed data-disabled:opacity-50';

  function select(action: string) {
    lastAction = action;
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class={triggerClass}>
    Account
    <ChevronDown class="size-4 text-text-muted" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content class={contentClass} sideOffset={6} align="start">
      <DropdownMenu.Item class={itemClass} onSelect={() => select('Profile')}>
        <User class="size-4 shrink-0" />
        Profile
      </DropdownMenu.Item>
      <DropdownMenu.Item class={itemClass} onSelect={() => select('Settings')}>
        <Settings class="size-4 shrink-0" />
        Settings
      </DropdownMenu.Item>

      <DropdownMenu.Sub>
        <DropdownMenu.SubTrigger class="{itemClass} justify-between">
          <span class="flex items-center gap-2">
            <Users class="size-4 shrink-0" />
            My Teams
          </span>
          <ChevronRight class="size-4 text-text-muted" />
        </DropdownMenu.SubTrigger>
        <DropdownMenu.SubContent class={contentClass} sideOffset={6}>
          <DropdownMenu.Item class={itemClass} onSelect={() => select('Froyotech')}>
            Froyotech
          </DropdownMenu.Item>
          <DropdownMenu.Item class={itemClass} onSelect={() => select('KND')}>KND</DropdownMenu.Item
          >
        </DropdownMenu.SubContent>
      </DropdownMenu.Sub>

      <DropdownMenu.Separator class="my-1 h-px bg-border-default" />

      <DropdownMenu.Item
        class="{itemClass} text-danger-400 data-highlighted:text-danger-300"
        onSelect={() => select('Sign out')}
      >
        <LogOut class="size-4 shrink-0" />
        Sign out
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
