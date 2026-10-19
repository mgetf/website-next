<script lang="ts">
  import { onMount } from 'svelte';
  import Bell from '~icons/lucide/bell';
  import Button from '#lib/components/ui/Button.svelte';
  import Tooltip from '#lib/components/ui/Tooltip.svelte';
  import { notificationPermissionCue } from '#lib/state/notificationPermissionCue.svelte.js';
  import {
    disableBrowserPush,
    enableBrowserPush,
    readBrowserPushStatus,
    syncBrowserPush,
    type BrowserPushStatus,
  } from '#lib/utils/browserPush.js';

  let status = $state<BrowserPushStatus>('hidden');
  let busy = $state(false);
  let error = $state('');

  const label = $derived(
    error ||
      (status === 'blocked'
        ? 'Computer notifications are blocked in this browser'
        : status === 'on'
          ? 'Turn off computer notifications'
          : 'Notify this computer'),
  );

  onMount(() => {
    let active = true;
    void syncBrowserPush().then((next) => {
      if (active) status = next;
    });
    return () => {
      active = false;
    };
  });

  async function turnOn() {
    busy = true;
    error = '';
    const prompting = typeof Notification !== 'undefined' && Notification.permission === 'default';
    if (prompting) notificationPermissionCue.show();
    try {
      await enableBrowserPush(() => notificationPermissionCue.hide());
      status = 'on';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not enable notifications';
      status = await readBrowserPushStatus();
      if (status === 'blocked') error = '';
    } finally {
      notificationPermissionCue.hide();
      busy = false;
    }
  }

  async function turnOff() {
    busy = true;
    error = '';
    try {
      await disableBrowserPush();
      status = await readBrowserPushStatus();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not turn notifications off';
    } finally {
      busy = false;
    }
  }

  function toggle() {
    if (status === 'on') void turnOff();
    else void turnOn();
  }
</script>

{#if status !== 'hidden'}
  <Tooltip text={label}>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="p-1.5! disabled:pointer-events-none"
      disabled={busy || status === 'blocked'}
      aria-pressed={status === 'on'}
      aria-label={label}
      onclick={toggle}
    >
      <Bell class="size-4 {status === 'on' ? 'text-success-400' : 'text-text-muted'}" />
    </Button>
  </Tooltip>
{/if}
