<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import { toast } from '$lib/state/toast.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let lastFormResult: ActionData = null;
  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  // Upload form state
  let uploadFormEl: HTMLFormElement | undefined = $state();
  let bspFileName = $state('');
  let cfgFileName = $state('');
  let thumbnailFileName = $state('');
  let uploading = $state(false);

  // Upload progress — two phases:
  // 'uploading': client → server (XHR upload progress, tracked %)
  // 'saving':    server → R2    (indeterminate fake progress)
  type UploadPhase = 'idle' | 'uploading' | 'saving';
  let uploadPhase = $state<UploadPhase>('idle');
  let uploadProgress = $state(0); // 0–100

  // Fake progress ticker for the indeterminate "saving" phase
  let fakeProgressTimer: ReturnType<typeof setInterval> | null = null;

  function startFakeProgress() {
    uploadProgress = 0;
    fakeProgressTimer = setInterval(() => {
      // Logarithmic approach to 90 — feels natural, never reaches 100 on its own
      uploadProgress = Math.min(90, uploadProgress + (90 - uploadProgress) * 0.06);
    }, 200);
  }

  function stopFakeProgress(complete = true) {
    if (fakeProgressTimer) {
      clearInterval(fakeProgressTimer);
      fakeProgressTimer = null;
    }
    if (complete) uploadProgress = 100;
  }

  async function handleUpload(e: SubmitEvent) {
    e.preventDefault();
    if (!uploadFormEl || uploading) return;

    const formData = new FormData(uploadFormEl);
    uploading = true;
    uploadPhase = 'uploading';
    uploadProgress = 0;

    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (ev) => {
          if (ev.lengthComputable) {
            uploadProgress = Math.round((ev.loaded / ev.total) * 100);
          }
        });

        xhr.upload.addEventListener('load', () => {
          // File received by server; now server is uploading to R2
          uploadPhase = 'saving';
          startFakeProgress();
        });

        xhr.addEventListener('load', async () => {
          stopFakeProgress(true);
          try {
            const result = JSON.parse(xhr.responseText) as {
              success?: boolean;
              message?: string;
              error?: string;
            };
            if (result.success) {
              toast.success(result.message ?? 'Map uploaded');
              uploadFormEl?.reset();
              bspFileName = '';
              cfgFileName = '';
              thumbnailFileName = '';
              await invalidateAll();
            } else {
              toast.error(result.error ?? 'Upload failed');
            }
          } catch {
            toast.error('Upload failed — unexpected response');
          }
          resolve();
        });

        xhr.addEventListener('error', () => {
          stopFakeProgress(false);
          toast.error('Upload failed — network error');
          reject();
        });

        xhr.open('POST', '/api/maps/upload');
        xhr.send(formData);
      });
    } catch {
      // error already toasted
    } finally {
      uploading = false;
      uploadPhase = 'idle';
      uploadProgress = 0;
    }
  }

  // Delete confirmation
  let deleteMapId = $state<number | null>(null);
  let deleteMapName = $state('');
  let showDeleteConfirm = $state(false);
  let deleteFormEl: HTMLFormElement | undefined = $state();

  function promptDelete(id: number, name: string) {
    deleteMapId = id;
    deleteMapName = name;
    showDeleteConfirm = true;
  }

  // Edit description state
  let editingMapId = $state<number | null>(null);
  let editDescription = $state('');

  function startEditDescription(id: number, currentDesc: string | null) {
    editingMapId = id;
    editDescription = currentDesc ?? '';
  }

  function cancelEdit() {
    editingMapId = null;
    editDescription = '';
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="max-w-5xl mx-auto space-y-8">
  <!-- Header -->
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Maps</h2>
    <p class="text-text-body">Upload and manage MGE map download packages for players.</p>
  </div>

  <!-- Upload Form -->
  <Card>
    <h3 class="text-lg font-semibold text-white mb-4">Upload New Map</h3>

    {#if !data.isR2Available}
      <p class="text-warning-400 text-sm">
        File storage (R2) is not configured on this server. Map uploads are unavailable.
      </p>
    {:else}
      <form
        enctype="multipart/form-data"
        bind:this={uploadFormEl}
        onsubmit={handleUpload}
        class="space-y-4"
      >
        <!-- BSP file -->
        <div>
          <p class="text-text-label text-sm font-medium mb-1">
            Map file <span class="text-danger-400">*</span>
            <span class="text-text-muted font-normal">(.bsp, max 200 MB)</span>
          </p>
          <label
            class="flex items-center gap-3 cursor-pointer rounded-lg border border-border-input bg-surface-input px-4 py-2.5 hover:border-primary-500 transition-colors"
          >
            <input
              type="file"
              name="bspFile"
              accept=".bsp"
              required
              class="sr-only"
              onchange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                bspFileName = f ? f.name : '';
              }}
            />
            <span class="text-text-muted text-sm flex-1 truncate">
              {bspFileName || 'Choose .bsp file…'}
            </span>
            <span class="text-primary-400 text-xs font-medium shrink-0">Browse</span>
          </label>
        </div>

        <!-- CFG file -->
        <div>
          <p class="text-text-label text-sm font-medium mb-1">
            Spawn config <span class="text-danger-400">*</span>
            <span class="text-text-muted font-normal">(.cfg, max 1 MB)</span>
          </p>
          <label
            class="flex items-center gap-3 cursor-pointer rounded-lg border border-border-input bg-surface-input px-4 py-2.5 hover:border-primary-500 transition-colors"
          >
            <input
              type="file"
              name="cfgFile"
              accept=".cfg"
              required
              class="sr-only"
              onchange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                cfgFileName = f ? f.name : '';
              }}
            />
            <span class="text-text-muted text-sm flex-1 truncate">
              {cfgFileName || 'Choose .cfg file…'}
            </span>
            <span class="text-primary-400 text-xs font-medium shrink-0">Browse</span>
          </label>
        </div>

        <!-- Thumbnail -->
        <div>
          <p class="text-text-label text-sm font-medium mb-1">
            Thumbnail
            <span class="text-text-muted font-normal">(optional, max 5 MB — JPEG/PNG/WebP)</span>
          </p>
          <label
            class="flex items-center gap-3 cursor-pointer rounded-lg border border-border-input bg-surface-input px-4 py-2.5 hover:border-primary-500 transition-colors"
          >
            <input
              type="file"
              name="thumbnailFile"
              accept=".jpg,.jpeg,.png,.webp"
              class="sr-only"
              onchange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                thumbnailFileName = f ? f.name : '';
              }}
            />
            <span class="text-text-muted text-sm flex-1 truncate">
              {thumbnailFileName || 'Choose image…'}
            </span>
            <span class="text-primary-400 text-xs font-medium shrink-0">Browse</span>
          </label>
        </div>

        <!-- Description -->
        <div>
          <label for="map-description" class="text-text-label text-sm font-medium mb-1 block">
            Description <span class="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="map-description"
            name="description"
            rows="2"
            placeholder="Short description of the arena…"
            class="w-full rounded-lg border border-border-input bg-surface-input px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          ></textarea>
        </div>

        {#if uploading}
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs text-text-muted">
              <span>
                {uploadPhase === 'uploading' ? 'Uploading to server…' : 'Saving to storage…'}
              </span>
              {#if uploadPhase === 'uploading'}
                <span>{uploadProgress}%</span>
              {/if}
            </div>
            <div class="w-full h-1.5 rounded-full bg-surface-input overflow-hidden">
              <div
                class="h-full rounded-full bg-primary-600 transition-[width] duration-200"
                style="width: {uploadProgress}%"
              ></div>
            </div>
          </div>
        {/if}

        <div class="flex justify-end">
          <Button type="submit" variant="primary" disabled={uploading}>
            {uploading
              ? uploadPhase === 'uploading'
                ? `Uploading… ${uploadProgress}%`
                : 'Saving to storage…'
              : 'Upload Map'}
          </Button>
        </div>
      </form>
    {/if}
  </Card>

  <!-- Map List -->
  <Card padding="none">
    <div class="px-5 py-4 border-b border-border-default">
      <h3 class="text-lg font-semibold text-white">
        Uploaded Maps
        <Badge color="zinc" size="md">{data.maps.length}</Badge>
      </h3>
    </div>

    {#if data.maps.length === 0}
      <p class="text-text-muted text-sm text-center py-8">No maps uploaded yet.</p>
    {:else}
      <div class="divide-y divide-border-default">
        {#each data.maps as map (map.id)}
          <div class="flex items-start gap-4 p-4">
            <!-- Thumbnail -->
            <div
              class="w-24 h-16 rounded-md overflow-hidden bg-surface-page shrink-0 flex items-center justify-center"
            >
              {#if map.thumbnailUrl}
                <img src={map.thumbnailUrl} alt={map.name} class="w-full h-full object-cover" />
              {:else}
                <span class="text-text-muted text-xs font-mono text-center px-1 leading-tight"
                  >{map.name}</span
                >
              {/if}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="font-mono font-semibold text-white text-sm truncate">{map.name}</p>

              {#if editingMapId === map.id}
                <form
                  method="POST"
                  action="?/updateDescription"
                  use:enhance={() =>
                    async ({ update }) => {
                      await update();
                      cancelEdit();
                    }}
                  class="mt-1 flex gap-2 items-start"
                >
                  <input type="hidden" name="mapId" value={map.id} />
                  <textarea
                    name="description"
                    bind:value={editDescription}
                    rows="2"
                    class="flex-1 rounded border border-border-input bg-surface-input px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                  ></textarea>
                  <div class="flex flex-col gap-1">
                    <Button type="submit" variant="primary" size="sm">Save</Button>
                    <Button type="button" variant="secondary" size="sm" onclick={cancelEdit}
                      >Cancel</Button
                    >
                  </div>
                </form>
              {:else}
                <p class="text-text-muted text-xs mt-0.5 line-clamp-2">
                  {map.description || '—'}
                </p>
                <button
                  type="button"
                  onclick={() => startEditDescription(map.id, map.description)}
                  class="text-xs text-primary-400 hover:text-primary-300 transition-colors mt-0.5"
                >
                  Edit description
                </button>
              {/if}

              <div class="flex flex-wrap gap-3 mt-1.5 text-xs text-text-muted">
                <span>.bsp {formatBytes(map.bspSizeBytes)}</span>
                <span>.cfg {formatBytes(map.cfgSizeBytes)}</span>
                <span>Uploaded by <span class="text-text-label">{map.uploaderName}</span></span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-2 shrink-0">
              <Button variant="danger" size="sm" onclick={() => promptDelete(map.id, map.name)}>
                Delete
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</div>

<!-- Hidden delete form -->
<form
  method="POST"
  action="?/delete"
  bind:this={deleteFormEl}
  use:enhance={() =>
    async ({ update }) => {
      await update();
    }}
  class="hidden"
>
  <input type="hidden" name="mapId" value={deleteMapId ?? ''} />
</form>

<!-- Delete Confirm Dialog -->
<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Map"
  description="Are you sure you want to delete {deleteMapName}? This will remove the BSP and CFG files from storage and cannot be undone."
  variant="danger"
  onConfirm={() => {
    showDeleteConfirm = false;
    deleteFormEl?.requestSubmit();
  }}
  onCancel={() => {
    showDeleteConfirm = false;
    deleteMapId = null;
  }}
/>
