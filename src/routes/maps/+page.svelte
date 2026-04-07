<script lang="ts">
  import type { PageData } from './$types';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  let { data }: { data: PageData } = $props();

  // ── Per-map file selection ───────────────────────────────────────────────────
  // Default: both files selected. Players can toggle .bsp / .cfg off per map.

  type FileSelection = { bsp: boolean; cfg: boolean };

  let selections = $state<Map<number, FileSelection>>(new Map());

  const selectedIds = $derived(
    new Set([...selections.entries()].filter(([, s]) => s.bsp || s.cfg).map(([id]) => id)),
  );

  const totalFiles = $derived(
    [...selections.values()].reduce((n, s) => n + (s.bsp ? 1 : 0) + (s.cfg ? 1 : 0), 0),
  );

  const allSelected = $derived(
    data.maps.length > 0 && data.maps.every((m) => selectedIds.has(m.id)),
  );

  function isSelected(id: number) {
    const s = selections.get(id);
    return !!(s && (s.bsp || s.cfg));
  }

  function getSelection(id: number): FileSelection {
    return selections.get(id) ?? { bsp: true, cfg: true };
  }

  function toggleMap(id: number) {
    const next = new Map(selections);
    if (isSelected(id)) {
      next.delete(id);
    } else {
      next.set(id, { bsp: true, cfg: true });
    }
    selections = next;
  }

  function toggleFile(id: number, file: 'bsp' | 'cfg', e: MouseEvent) {
    e.stopPropagation();
    const current = selections.get(id) ?? { bsp: true, cfg: true };
    const updated = { ...current, [file]: !current[file] };
    const next = new Map(selections);
    // If both are now off, deselect the map entirely
    if (!updated.bsp && !updated.cfg) {
      next.delete(id);
    } else {
      next.set(id, updated);
    }
    selections = next;
  }

  function toggleAll() {
    if (allSelected) {
      selections = new Map();
    } else {
      const next = new Map<number, FileSelection>();
      for (const m of data.maps) next.set(m.id, { bsp: true, cfg: true });
      selections = next;
    }
  }

  function clearAll() {
    selections = new Map();
  }

  // ── Download progress ────────────────────────────────────────────────────────

  let downloading = $state(false);
  let errorMessage = $state('');

  type DownloadPhase = 'idle' | 'preparing' | 'downloading';
  let downloadPhase = $state<DownloadPhase>('idle');
  let downloadProgress = $state(0);

  let fakeProgressTimer: ReturnType<typeof setInterval> | null = null;

  function startFakeProgress() {
    downloadProgress = 0;
    fakeProgressTimer = setInterval(() => {
      downloadProgress = Math.min(90, downloadProgress + (90 - downloadProgress) * 0.07);
    }, 150);
  }

  function stopFakeProgress() {
    if (fakeProgressTimer) {
      clearInterval(fakeProgressTimer);
      fakeProgressTimer = null;
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function triggerBlobDownload(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mge-maps.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadSelected() {
    if (selectedIds.size === 0) return;
    errorMessage = '';
    downloading = true;
    downloadPhase = 'preparing';
    downloadProgress = 0;
    startFakeProgress();

    // Build per-map file preference list
    const maps = [...selections.entries()]
      .filter(([, s]) => s.bsp || s.cfg)
      .map(([id, s]) => ({ id, bsp: s.bsp, cfg: s.cfg }));

    try {
      const response = await fetch('/api/maps/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maps }),
      });

      if (!response.ok) {
        const text = await response.text();
        errorMessage = text || 'Download failed. Please try again.';
        return;
      }

      stopFakeProgress();
      downloadPhase = 'downloading';
      downloadProgress = 0;

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      if (!response.body || total === 0) {
        const blob = await response.blob();
        downloadProgress = 100;
        triggerBlobDownload(blob);
        return;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        downloadProgress = Math.round((received / total) * 100);
      }

      downloadProgress = 100;
      triggerBlobDownload(new Blob(chunks, { type: 'application/zip' }));
    } catch {
      errorMessage = 'An unexpected error occurred. Please try again.';
    } finally {
      stopFakeProgress();
      downloading = false;
      downloadPhase = 'idle';
      downloadProgress = 0;
    }
  }
</script>

<svelte:head>
  <title>Maps — MGE.tf</title>
</svelte:head>

<PageHero title="Maps" subtitle="Download MGE arenas and spawn configs for your server." border />

<div class="max-w-6xl mx-auto px-6 py-10">
  {#if data.maps.length === 0}
    <Card>
      <p class="text-text-muted text-center py-8">No maps have been uploaded yet.</p>
    </Card>
  {:else}
    <!-- Controls bar -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 cursor-pointer select-none text-text-label text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onchange={toggleAll}
            class="w-4 h-4 rounded border-border-input bg-surface-input accent-primary-600 cursor-pointer"
          />
          {allSelected ? 'Deselect all' : 'Select all'}
          <span class="text-text-muted">({data.maps.length} maps)</span>
        </label>

        {#if selectedIds.size > 0}
          <span class="text-text-muted text-sm">
            {selectedIds.size} map{selectedIds.size !== 1 ? 's' : ''} · {totalFiles} file{totalFiles !==
            1
              ? 's'
              : ''}
          </span>
        {/if}
      </div>

      <div class="flex flex-col items-end gap-2">
        {#if errorMessage}
          <p class="text-danger-400 text-sm">{errorMessage}</p>
        {/if}
        <Button
          variant="primary"
          disabled={selectedIds.size === 0 || downloading}
          onclick={downloadSelected}
        >
          {#if downloading}
            {downloadPhase === 'preparing' ? 'Preparing zip…' : `Downloading… ${downloadProgress}%`}
          {:else}
            Download{selectedIds.size > 0
              ? ` (${totalFiles} file${totalFiles !== 1 ? 's' : ''})`
              : ''}
          {/if}
        </Button>
        {#if downloading}
          <div class="w-48">
            <div class="w-full h-1 rounded-full bg-surface-input overflow-hidden">
              <div
                class="h-full rounded-full bg-primary-600 transition-[width] duration-150"
                style="width: {downloadProgress}%"
              ></div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Download structure hint -->
    <Card padding="sm" class="mb-6 text-sm text-text-muted">
      <p>
        The zip uses the correct TF2 directory structure:
        <code class="font-mono text-text-label">maps/</code> for .bsp files and
        <code class="font-mono text-text-label">addons/sourcemod/configs/mge/</code> for spawn
        configs. Select individual files per map using the <span class="text-text-label">.bsp</span>
        / <span class="text-text-label">.cfg</span> chips on each card.
      </p>
    </Card>

    <!-- Map grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.maps as map (map.id)}
        {@const sel = isSelected(map.id)}
        {@const fileSel = getSelection(map.id)}
        <!-- svelte-ignore a11y_interactive_supports_focus -->
        <div
          role="button"
          tabindex="0"
          onclick={() => toggleMap(map.id)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? toggleMap(map.id) : null)}
          class="relative text-left rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500
            {sel
            ? 'border-primary-600 bg-surface-card ring-1 ring-primary-600'
            : 'border-border-default bg-surface-card hover:border-border-input'}"
        >
          <!-- Thumbnail -->
          <div class="relative aspect-video rounded-t-lg overflow-hidden bg-surface-page">
            {#if map.thumbnailUrl}
              <img src={map.thumbnailUrl} alt={map.name} class="w-full h-full object-cover" />
            {:else}
              <div
                class="w-full h-full flex items-center justify-center text-text-muted text-xs font-mono"
              >
                {map.name}
              </div>
            {/if}

            <!-- Checkbox overlay -->
            <div class="absolute top-2 right-2">
              <div
                class="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  {sel
                  ? 'bg-primary-600 border-primary-600'
                  : 'bg-surface-card/80 border-border-input'}"
              >
                {#if sel}
                  <svg class="w-3 h-3 text-white" viewBox="0 0 12 12">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      fill="none"
                    />
                  </svg>
                {/if}
              </div>
            </div>
          </div>

          <!-- Info -->
          <div class="p-3">
            <p class="font-mono text-sm font-semibold text-white truncate">{map.name}</p>
            {#if map.description}
              <p class="text-text-muted text-xs mt-0.5 line-clamp-2">{map.description}</p>
            {/if}

            <!-- File size row + per-file toggles when selected -->
            <div class="flex items-center justify-between mt-2 gap-2">
              <div class="flex gap-3 text-xs text-text-muted">
                <span>.bsp {formatBytes(map.bspSizeBytes)}</span>
                <span>.cfg {formatBytes(map.cfgSizeBytes)}</span>
              </div>

              {#if sel}
                <!-- File toggles — stop propagation so they don't toggle the whole card -->
                <div class="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onclick={(e) => toggleFile(map.id, 'bsp', e)}
                    title={fileSel.bsp ? 'Exclude .bsp' : 'Include .bsp'}
                    class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors
                      {fileSel.bsp
                      ? 'bg-primary-600/20 border-primary-500 text-primary-400'
                      : 'bg-surface-input border-border-input text-text-muted line-through'}"
                  >
                    .bsp
                  </button>
                  <button
                    type="button"
                    onclick={(e) => toggleFile(map.id, 'cfg', e)}
                    title={fileSel.cfg ? 'Exclude .cfg' : 'Include .cfg'}
                    class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors
                      {fileSel.cfg
                      ? 'bg-primary-600/20 border-primary-500 text-primary-400'
                      : 'bg-surface-input border-border-input text-text-muted line-through'}"
                  >
                    .cfg
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Sticky bottom bar when something is selected -->
    {#if selectedIds.size > 0}
      <div
        class="fixed bottom-0 left-0 right-0 z-50 bg-surface-card border-t border-border-default shadow-lg"
      >
        {#if downloading}
          <div class="w-full h-1 bg-surface-input">
            <div
              class="h-full bg-primary-600 transition-[width] duration-150"
              style="width: {downloadProgress}%"
            ></div>
          </div>
        {/if}
        <div class="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div class="flex flex-col gap-0.5">
            <span class="text-text-label text-sm">
              {selectedIds.size} map{selectedIds.size !== 1 ? 's' : ''} · {totalFiles} file{totalFiles !==
              1
                ? 's'
                : ''} selected
            </span>
            {#if downloading}
              <span class="text-text-muted text-xs">
                {downloadPhase === 'preparing'
                  ? 'Building zip…'
                  : `Downloading… ${downloadProgress}%`}
              </span>
            {/if}
          </div>
          <div class="flex gap-3 items-center">
            {#if errorMessage}
              <p class="text-danger-400 text-sm">{errorMessage}</p>
            {/if}
            {#if !downloading}
              <button
                type="button"
                onclick={clearAll}
                class="text-text-muted text-sm hover:text-text-label transition-colors"
              >
                Clear
              </button>
            {/if}
            <Button variant="primary" disabled={downloading} onclick={downloadSelected}>
              {#if downloading}
                {downloadPhase === 'preparing'
                  ? 'Building zip…'
                  : `Downloading… ${downloadProgress}%`}
              {:else}
                Download {totalFiles} file{totalFiles !== 1 ? 's' : ''}
              {/if}
            </Button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
