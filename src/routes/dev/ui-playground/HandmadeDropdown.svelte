<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ChevronDown from '~icons/lucide/chevron-down';
  import LogOut from '~icons/lucide/log-out';
  import Settings from '~icons/lucide/settings';
  import User from '~icons/lucide/user';

  let { lastAction = $bindable('') }: { lastAction?: string } = $props();

  let open = $state(false);

  function close() {
    open = false;
  }

  function toggle() {
    open = !open;
  }

  function select(action: string) {
    lastAction = action;
    close();
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.handmade-dropdown')) {
      close();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') close();
  }
</script>

<svelte:window onclick={open ? handleWindowClick : undefined} onkeydown={handleKeydown} />

<div class="handmade-dropdown relative inline-block">
  <Button variant="secondary" type="button" class="inline-flex items-center gap-2" onclick={toggle}>
    Account
    <ChevronDown class="size-4 text-text-muted transition-transform {open ? 'rotate-180' : ''}" />
  </Button>

  {#if open}
    <div class="absolute left-0 z-50 mt-2 min-w-52">
      <Card padding="none" class="shadow-xl">
        <div class="p-1">
          <Button
            variant="ghost"
            type="button"
            class="flex w-full items-center justify-start gap-2"
            onclick={() => select('Profile')}
          >
            <User class="size-4 shrink-0" />
            Profile
          </Button>
          <Button
            variant="ghost"
            type="button"
            class="flex w-full items-center justify-start gap-2"
            onclick={() => select('Settings')}
          >
            <Settings class="size-4 shrink-0" />
            Settings
          </Button>
          <div class="my-1 h-px bg-border-default"></div>
          <Button
            variant="ghost"
            type="button"
            class="flex w-full items-center justify-start gap-2 text-danger-400"
            onclick={() => select('Sign out')}
          >
            <LogOut class="size-4 shrink-0" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  {/if}
</div>
