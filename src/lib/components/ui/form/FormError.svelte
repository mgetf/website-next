<script lang="ts">
  let {
    error,
    success,
  }: {
    error?: string | null;
    success?: string | null;
  } = $props();

  const hasMessage = $derived(!!error || !!success);
  const isError = $derived(!!error);

  const colorClasses = $derived(
    isError
      ? 'bg-danger-500/20 border border-danger-500/50'
      : 'bg-success-500/20 border border-success-500/50',
  );
  const textClasses = $derived(isError ? 'text-danger-400' : 'text-success-400');
</script>

{#if hasMessage}
  <div class="p-4 rounded-lg mb-6 {colorClasses}">
    <p class={textClasses}>{error || success}</p>
  </div>
{/if}
