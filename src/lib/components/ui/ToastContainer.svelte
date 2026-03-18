<script lang="ts">
  import { toast } from '$lib/state/toast.svelte';
  import Toast from './Toast.svelte';
</script>

{#if toast.toasts.length > 0}
  <div class="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2" aria-live="polite">
    {#each toast.toasts as t (t.id)}
      <Toast
        type={t.type}
        message={t.message}
        dismissible={t.dismissible}
        onDismiss={() => toast.dismiss(t.id)}
      />
    {/each}
  </div>
{/if}
