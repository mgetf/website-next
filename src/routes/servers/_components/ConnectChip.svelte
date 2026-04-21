<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';

  let { connect }: { connect: string } = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(connect);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copied = false;
        copyTimer = null;
      }, 1500);
    } catch {
      // clipboard unavailable — silent fail
    }
  }
</script>

<div class="flex items-center gap-2">
  <!-- IP chip with inline copy -->
  <button
    type="button"
    onclick={copyToClipboard}
    aria-label="Copy {connect} to clipboard"
    title={copied ? 'Copied!' : 'Copy address'}
    class="flex items-center gap-1.5 font-mono text-[11px] px-2 py-1 rounded border transition-all
      {copied
      ? 'bg-success-500/15 border-success-500/40 text-success-400'
      : 'bg-surface-input border-border-input text-text-muted hover:text-text-label hover:border-border-default'}"
  >
    <span>{connect}</span>
    {#if copied}
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M2 6l3 3 5-5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    {:else}
      <svg class="w-3 h-3 shrink-0 opacity-50" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <rect x="3" y="2" width="7" height="9" rx="1" stroke="currentColor" stroke-width="1.2" />
        <path
          d="M3 4H2a1 1 0 00-1 1v5a1 1 0 001 1h5a1 1 0 001-1v-1"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>
    {/if}
  </button>

  <Button variant="primary" size="sm" href="steam://connect/{connect}">Connect</Button>
</div>
