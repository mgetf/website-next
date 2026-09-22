<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import Card from '$lib/components/ui/Card.svelte';
  import DataTable, { type Column } from '$lib/components/ui/DataTable.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import { toast } from '$lib/state/toast.svelte';

  type MapRow = (typeof data.maps)[number];

  const mapColumns: Column[] = [
    { key: 'name', label: 'Map' },
    { key: 'bspUrl', label: '.bsp' },
    { key: 'cfgUrl', label: '.cfg' },
    { key: 'uploader', label: 'Added by' },
    { key: 'actions', label: 'Actions', align: 'right', srOnly: true },
  ];

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const fieldErrors = $derived(form && 'errors' in form ? (form.errors ?? {}) : {});

  let lastFormResult: ActionData = null;
  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
        cancelEdit();
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  let createFormEl: HTMLFormElement | undefined = $state();

  let editingMapId = $state<number | null>(null);
  let editName = $state('');
  let editBspUrl = $state('');
  let editCfgUrl = $state('');
  let editDescription = $state('');

  function startEdit(row: MapRow) {
    editingMapId = row.id;
    editName = row.name;
    editBspUrl = row.bspUrl;
    editCfgUrl = row.cfgUrl;
    editDescription = row.description ?? '';
  }

  function cancelEdit() {
    editingMapId = null;
    editName = '';
    editBspUrl = '';
    editCfgUrl = '';
    editDescription = '';
  }

  let deleteMapId = $state<number | null>(null);
  let deleteMapName = $state('');
  let showDeleteConfirm = $state(false);
  let deleteFormEl: HTMLFormElement | undefined = $state();

  function promptDelete(id: number, name: string) {
    deleteMapId = id;
    deleteMapName = name;
    showDeleteConfirm = true;
  }

  function hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
</script>

<div class="max-w-5xl mx-auto space-y-8">
  <div>
    <h2 class="text-3xl font-bold text-white mb-2">Maps</h2>
    <p class="text-text-body">
      Catalog of MGE maps for players. Each entry stores a name plus the public URLs for the .bsp
      and .cfg. Downloads zip those files on demand.
    </p>
  </div>

  <Card>
    {#if editingMapId === null}
      <h3 class="text-lg font-semibold text-white mb-4">Add map</h3>
      <form
        method="POST"
        action="?/create"
        bind:this={createFormEl}
        use:enhance={() =>
          async ({ result, update }) => {
            await update();
            if (result.type === 'success') createFormEl?.reset();
          }}
        class="space-y-0"
      >
        <FormInput
          label="Map name"
          name="name"
          required
          placeholder="mge_chillypunch_final4"
          hint="Stem used inside the zip (maps/name.bsp and addons/sourcemod/configs/mge/name.cfg). Lowercase letters, numbers, and underscores."
          error={fieldErrors.name}
        />
        <FormInput
          label=".bsp URL"
          name="bspUrl"
          type="url"
          required
          placeholder="https://…"
          hint="Direct https link to the map file, for example a Cerveme download."
          error={fieldErrors.bspUrl}
        />
        <FormInput
          label=".cfg URL"
          name="cfgUrl"
          type="url"
          required
          placeholder="https://…"
          hint="Direct https link to the spawn config, for example a GitHub raw URL."
          error={fieldErrors.cfgUrl}
        />
        <div class="mb-6">
          <label for="map-description" class="block text-sm font-medium text-text-label mb-2">
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
        <div class="flex justify-end">
          <Button type="submit" variant="primary">Add map</Button>
        </div>
      </form>
    {:else}
      <h3 class="text-lg font-semibold text-white mb-4">Edit {editName}</h3>
      <form method="POST" action="?/update" use:enhance class="space-y-0">
        <input type="hidden" name="mapId" value={editingMapId} />
        <FormInput
          label="Map name"
          name="name"
          required
          bind:value={editName}
          error={fieldErrors.name}
        />
        <FormInput
          label=".bsp URL"
          name="bspUrl"
          type="url"
          required
          bind:value={editBspUrl}
          error={fieldErrors.bspUrl}
        />
        <FormInput
          label=".cfg URL"
          name="cfgUrl"
          type="url"
          required
          bind:value={editCfgUrl}
          error={fieldErrors.cfgUrl}
        />
        <div class="mb-6">
          <label for="edit-map-description" class="block text-sm font-medium text-text-label mb-2">
            Description <span class="text-text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="edit-map-description"
            name="description"
            rows="2"
            bind:value={editDescription}
            class="w-full rounded-lg border border-border-input bg-surface-input px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          ></textarea>
        </div>
        <div class="flex justify-end gap-2">
          <Button type="button" variant="secondary" onclick={cancelEdit}>Cancel</Button>
          <Button type="submit" variant="primary">Save</Button>
        </div>
      </form>
    {/if}
  </Card>

  <h3 class="text-lg font-semibold text-white mb-3">
    Catalog
    <Badge color="zinc" size="md">{data.maps.length}</Badge>
  </h3>

  <DataTable data={data.maps} columns={mapColumns} emptyMessage="No maps listed yet." compact>
    {#snippet cell(row: MapRow, col: Column)}
      {#if col.key === 'name'}
        <span class="font-mono font-semibold text-white text-sm">{row.name}</span>
        {#if row.description}
          <p class="text-text-muted text-xs mt-0.5 line-clamp-1">{row.description}</p>
        {/if}
      {:else if col.key === 'bspUrl'}
        <a
          href={row.bspUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-primary-400 hover:text-primary-300 truncate max-w-[12rem] block"
          title={row.bspUrl}>{hostOf(row.bspUrl)}</a
        >
      {:else if col.key === 'cfgUrl'}
        <a
          href={row.cfgUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-primary-400 hover:text-primary-300 truncate max-w-[12rem] block"
          title={row.cfgUrl}>{hostOf(row.cfgUrl)}</a
        >
      {:else if col.key === 'uploader'}
        <span class="text-text-muted text-xs">{row.uploaderName}</span>
      {:else if col.key === 'actions'}
        <div class="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onclick={() => startEdit(row)}>Edit</Button>
          <Button variant="danger" size="sm" onclick={() => promptDelete(row.id, row.name)}>
            Delete
          </Button>
        </div>
      {/if}
    {/snippet}
  </DataTable>
</div>

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

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete map"
  description="Remove {deleteMapName} from the catalog? The files stay at their original URLs."
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
