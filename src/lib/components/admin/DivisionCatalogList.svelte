<script lang="ts">
  import { deserialize, enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { toast } from '$lib/state/toast.svelte';

  type CatalogDivision = {
    id: number;
    name: string;
    signupCost: number;
    hidden: number;
    regionId: number;
    formatId: number;
    formatName: string;
    teams: number;
    itemPayment: {
      steamItemId: number;
      itemQuantity: number;
      steamItemName: string;
    } | null;
  };

  let {
    divisions,
    regionId,
    formatId,
    currencySymbol,
    canReorder,
    selectedIds,
    onToggleSelected,
    onEdit,
    onDelete,
  }: {
    divisions: CatalogDivision[];
    regionId: number;
    formatId: number;
    currencySymbol: string;
    canReorder: boolean;
    selectedIds: number[];
    onToggleSelected: (id: number, checked: boolean) => void;
    onEdit: (division: CatalogDivision) => void;
    onDelete: (division: CatalogDivision) => void;
  } = $props();

  let items = $state<CatalogDivision[]>([]);
  let dragging = $state(false);
  let saving = $state(false);

  const selectedIdSet = $derived(new Set(selectedIds));
  const zoneType = $derived(`division-catalog-${regionId}-${formatId}`);
  const dragEnabled = $derived(canReorder && items.length > 1 && !saving);
  const colsClass = $derived(
    canReorder
      ? 'min-w-[720px] grid-cols-[2.5rem_1.25rem_minmax(12rem,1.4fr)_minmax(8rem,1fr)_7rem_6rem_minmax(12rem,auto)] items-center gap-3 px-6'
      : 'min-w-[720px] grid-cols-[minmax(12rem,1.4fr)_minmax(8rem,1fr)_7rem_6rem] items-center gap-3 px-6',
  );

  $effect(() => {
    if (dragging || saving) return;
    items = [...divisions];
  });

  function sameOrder(next: CatalogDivision[]): boolean {
    return (
      next.length === divisions.length &&
      next.every((division, index) => division.id === divisions[index]?.id)
    );
  }

  function stopDrag(event: Event) {
    event.stopPropagation();
  }

  function handleConsider(event: CustomEvent<DndEvent<CatalogDivision>>) {
    dragging = true;
    items = event.detail.items;
  }

  async function handleFinalize(event: CustomEvent<DndEvent<CatalogDivision>>) {
    items = event.detail.items;
    if (!canReorder || sameOrder(items)) {
      dragging = false;
      return;
    }

    saving = true;
    dragging = false;
    const previous = [...divisions];
    const formData = new FormData();
    formData.set('regionId', String(regionId));
    formData.set('formatId', String(formatId));
    for (const division of items) {
      formData.append('divisionIds', String(division.id));
    }

    try {
      const response = await fetch('?/reorderDivisions', { method: 'POST', body: formData });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        const message =
          result.data &&
          typeof result.data === 'object' &&
          'message' in result.data &&
          typeof result.data.message === 'string'
            ? result.data.message
            : 'Division order saved';
        toast.success(message);
        await invalidateAll();
      } else {
        items = previous;
        const error =
          result.type === 'failure' &&
          result.data &&
          typeof result.data === 'object' &&
          'error' in result.data &&
          typeof result.data.error === 'string'
            ? result.data.error
            : 'Failed to reorder divisions';
        toast.error(error);
      }
    } catch {
      items = previous;
      toast.error('Failed to reorder divisions');
    } finally {
      saving = false;
    }
  }
</script>

<div class="overflow-x-auto">
  <div
    class="hidden text-xs font-medium uppercase tracking-wider text-text-muted sm:grid {colsClass} py-2"
  >
    {#if canReorder}
      <span></span>
      <span></span>
    {/if}
    <span>Division</span>
    <span>Signup Cost</span>
    <span>Visibility</span>
    <span>Teams</span>
    {#if canReorder}
      <span class="text-right">Actions</span>
    {/if}
  </div>

  <div
    use:dndzone={{
      items,
      type: zoneType,
      flipDurationMs: 200,
      dropFromOthersDisabled: true,
      dragDisabled: !dragEnabled,
    }}
    onconsider={handleConsider}
    onfinalize={handleFinalize}
    class="divide-y divide-border-default"
  >
    {#each items as division (division.id)}
      <div
        class="grid {colsClass} py-3 {dragEnabled ? 'cursor-grab select-none' : ''} {saving
          ? 'opacity-70'
          : ''}"
      >
        {#if canReorder}
          <div class="flex items-center">
            <input
              id="select-division-{division.id}"
              type="checkbox"
              checked={selectedIdSet.has(division.id)}
              onchange={(e) => onToggleSelected(division.id, e.currentTarget.checked)}
              onpointerdown={stopDrag}
            />
            <label for="select-division-{division.id}" class="sr-only">Select {division.name}</label
            >
          </div>
          <span class="text-sm leading-none text-text-muted" aria-hidden="true">⠿</span>
        {/if}
        <div class="flex min-w-0 items-center gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary-500/30 bg-primary-500/10"
          >
            <span class="text-lg font-bold text-primary-400"
              >{division.name.charAt(0).toUpperCase()}</span
            >
          </div>
          <div class="min-w-0">
            <div class="truncate font-semibold text-white">{division.name}</div>
            <div class="text-xs text-text-muted">ID: {division.id}</div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#if division.signupCost > 0}
            <span class="text-sm font-medium text-success-400"
              >{currencySymbol}{division.signupCost.toFixed(2)}</span
            >
          {:else}
            <span class="text-sm text-text-muted">Free</span>
          {/if}
          {#if division.itemPayment}
            <Badge color="purple"
              >{division.itemPayment.itemQuantity}x {division.itemPayment.steamItemName}</Badge
            >
          {/if}
        </div>
        <Badge color={division.hidden === 0 ? 'green' : 'zinc'}>
          {division.hidden === 0 ? 'Visible' : 'Hidden'}
        </Badge>
        <div>
          <span class="text-sm font-medium text-white">{division.teams}</span>
          <span class="ml-1 text-xs text-text-muted">teams</span>
        </div>
        {#if canReorder}
          <div class="flex items-center justify-end gap-2">
            <form
              method="POST"
              action="?/toggleDivisionVisibility"
              use:enhance
              onpointerdown={stopDrag}
            >
              <input type="hidden" name="divisionId" value={division.id} />
              <Button type="submit" variant="secondary" size="sm">
                {division.hidden === 0 ? 'Hide' : 'Show'}
              </Button>
            </form>
            <Button
              variant="secondary"
              size="sm"
              onpointerdown={stopDrag}
              onclick={() => onEdit(division)}>Edit</Button
            >
            <Button
              variant="danger"
              size="sm"
              onpointerdown={stopDrag}
              onclick={() => onDelete(division)}>Delete</Button
            >
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
