<script lang="ts">
  import { refreshAll } from '$app/navigation';
  import Button from '#lib/components/ui/Button.svelte';
  import { formatRelativeTime } from '#lib/utils/profile.js';

  let {
    steamId,
    cachedAt,
  }: {
    steamId: string;
    cachedAt: string | null;
  } = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);

  async function reload() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`/api/admin/profiling/${encodeURIComponent(steamId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error('failed');
      await refreshAll();
    } catch {
      error = 'Could not reload this snapshot.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex flex-wrap items-center gap-3">
  <p class="text-xs text-text-muted">
    {#if cachedAt}
      Cached {formatRelativeTime(cachedAt)}
    {:else}
      Not cached yet
    {/if}
  </p>
  <Button
    variant="secondary"
    size="sm"
    type="button"
    disabled={loading}
    onclick={() => void reload()}
  >
    {loading ? 'Reloading…' : 'Reload'}
  </Button>
  {#if error}
    <p class="text-xs text-danger-400">{error}</p>
  {/if}
</div>
