<script lang="ts">
  import type { PageData } from './$types';
  import PageHero from '$lib/components/layout/PageHero.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type MapRow = (typeof data.maps)[number];

  const columns: Column[] = [
    { key: 'checkbox', label: 'Select', srOnly: true, width: '2.5rem' },
    { key: 'name', label: 'Map' },
    { key: 'bspSize', label: '.bsp size', align: 'right' },
    { key: 'cfgSize', label: '.cfg size', align: 'right' },
    { key: 'files', label: 'Files', align: 'right' },
  ];

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
    const next = new Map(selections);
    if (!isSelected(id)) {
      // Map not yet selected — select it with only this file type
      next.set(id, { bsp: file === 'bsp', cfg: file === 'cfg' });
    } else {
      const current = selections.get(id)!;
      const updated = { ...current, [file]: !current[file] };
      // If both are now off, deselect the map entirely
      if (!updated.bsp && !updated.cfg) {
        next.delete(id);
      } else {
        next.set(id, updated);
      }
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

  const DOWNLOAD_TIMEOUT_MS = 180_000; // 3 minutes for zip preparation
  const STREAM_STALL_MS = 30_000; // 30s without receiving data

  async function downloadSelected() {
    if (selectedIds.size === 0) return;
    errorMessage = '';
    downloading = true;
    downloadPhase = 'preparing';
    downloadProgress = 0;
    startFakeProgress();

    const maps = [...selections.entries()]
      .filter(([, s]) => s.bsp || s.cfg)
      .map(([id, s]) => ({ id, bsp: s.bsp, cfg: s.cfg }));

    const controller = new AbortController();
    let downloadTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      // Guard against the zip preparation hanging forever
      downloadTimeout = setTimeout(() => {
        controller.abort();
        errorMessage = 'Download timed out — the server took too long to build the zip.';
      }, DOWNLOAD_TIMEOUT_MS);

      const response = await fetch('/api/maps/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maps }),
        signal: controller.signal,
      });

      if (downloadTimeout) {
        clearTimeout(downloadTimeout);
        downloadTimeout = null;
      }

      if (!response.ok) {
        let detail = '';
        try {
          detail = await response.text();
        } catch {
          /* ignore */
        }
        errorMessage =
          response.status === 502
            ? 'Some map files could not be retrieved from storage. Try again later.'
            : detail || `Download failed (HTTP ${response.status}). Please try again.`;
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
      let lastDataAt = Date.now();

      // Stall detection for the streaming phase
      const stallCheck = setInterval(() => {
        if (Date.now() - lastDataAt > STREAM_STALL_MS) {
          clearInterval(stallCheck);
          controller.abort();
          errorMessage = 'Download stalled — try again or check your connection.';
        }
      }, 5_000);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          lastDataAt = Date.now();
          downloadProgress = Math.round((received / total) * 100);
        }
      } finally {
        clearInterval(stallCheck);
      }

      downloadProgress = 100;
      triggerBlobDownload(new Blob(chunks, { type: 'application/zip' }));
    } catch (err) {
      if (!errorMessage) {
        errorMessage =
          err instanceof DOMException && err.name === 'AbortError'
            ? errorMessage || 'Download was cancelled.'
            : 'An unexpected error occurred. Please try again.';
      }
    } finally {
      if (downloadTimeout) clearTimeout(downloadTimeout);
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
      configs. Toggle individual file types per map using the
      <span class="text-text-label">.bsp</span> /
      <span class="text-text-label">.cfg</span> buttons in the table.
    </p>
  </Card>

  <!-- Map table -->
  <DataTable
    data={data.maps}
    {columns}
    emptyMessage="No maps have been uploaded yet."
    onRowClick={(row) => toggleMap(row.id)}
    rowClass={(row) => (isSelected(row.id) ? 'bg-primary-600/5' : '')}
  >
    {#snippet cell(row: MapRow, col: Column)}
      {#if col.key === 'checkbox'}
        <input
          type="checkbox"
          checked={isSelected(row.id)}
          onclick={(e) => e.stopPropagation()}
          onchange={() => toggleMap(row.id)}
          class="w-4 h-4 rounded border-border-input bg-surface-input accent-primary-600 cursor-pointer"
        />
      {:else if col.key === 'name'}
        <p class="font-mono font-semibold text-white">{row.name}</p>
        {#if row.description}
          <p class="text-text-muted text-xs mt-0.5 line-clamp-1">{row.description}</p>
        {/if}
      {:else if col.key === 'bspSize'}
        <span class="text-text-muted font-mono text-xs">{formatBytes(row.bspSizeBytes)}</span>
      {:else if col.key === 'cfgSize'}
        <span class="text-text-muted font-mono text-xs">{formatBytes(row.cfgSizeBytes)}</span>
      {:else if col.key === 'files'}
        {@const sel = isSelected(row.id)}
        {@const fileSel = getSelection(row.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex gap-1 justify-end"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onclick={(e) => toggleFile(row.id, 'bsp', e)}
            title={sel && fileSel.bsp ? 'Exclude .bsp' : 'Include .bsp'}
            class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors
              {sel && fileSel.bsp
              ? 'bg-primary-600/20 border-primary-500 text-primary-400'
              : 'bg-surface-input border-border-input text-text-muted'}"
          >
            .bsp
          </button>
          <button
            type="button"
            onclick={(e) => toggleFile(row.id, 'cfg', e)}
            title={sel && fileSel.cfg ? 'Exclude .cfg' : 'Include .cfg'}
            class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border transition-colors
              {sel && fileSel.cfg
              ? 'bg-primary-600/20 border-primary-500 text-primary-400'
              : 'bg-surface-input border-border-input text-text-muted'}"
          >
            .cfg
          </button>
        </div>
      {/if}
    {/snippet}
  </DataTable>

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
</div>
