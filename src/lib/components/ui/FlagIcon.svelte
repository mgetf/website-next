<script lang="ts">
  let { code = '', class: className = '' }: { code?: string | null; class?: string } = $props();

  const iso = $derived(code?.trim().toLowerCase() ?? '');
  const known = $derived(/^[a-z]{2,3}$/.test(iso));
</script>

{#if known}
  <span class="fi fi-{iso} rounded-lg shrink-0 {className}"></span>
{:else}
  <span
    class="inline-flex items-center justify-center rounded-sm shrink-0 bg-surface-input border border-border-default text-text-muted {className}"
    title="Unknown region flag"
    aria-label="Unknown flag"
  >
    <span class="font-black leading-none text-[0.7em]">?</span>
  </span>
{/if}
