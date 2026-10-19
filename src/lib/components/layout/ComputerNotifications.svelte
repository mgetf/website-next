<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '#lib/components/ui/Button.svelte';
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
    try {
      await enableBrowserPush();
      status = 'on';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not enable notifications';
      status = await readBrowserPushStatus();
      if (status === 'blocked') error = '';
    } finally {
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
</script>

{#if status !== 'hidden'}
  <div class="border-b border-border-default px-3 py-2">
    {#if status === 'blocked'}
      <p class="text-xs text-text-muted">Computer notifications are blocked in this browser.</p>
    {:else if status === 'on'}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="w-full"
        disabled={busy}
        onclick={turnOff}
      >
        {busy ? 'Saving…' : 'Turn off computer notifications'}
      </Button>
    {:else}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="w-full"
        disabled={busy}
        onclick={turnOn}
      >
        {busy ? 'Saving…' : 'Notify this computer'}
      </Button>
    {/if}
    {#if error}
      <p class="mt-1 text-xs text-danger-400">{error}</p>
    {/if}
  </div>
{/if}
