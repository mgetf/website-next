<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { goto, invalidateAll } from '$app/navigation';
  import { enhance } from '$app/forms';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { untrack } from 'svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import FlagIcon from '$lib/components/ui/FlagIcon.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';
  import ProfilingCardFacts from '$lib/components/admin/ProfilingCardFacts.svelte';
  import ProfilingPeek from '$lib/components/admin/ProfilingPeek.svelte';
  import SearchInput from '$lib/components/ui/SearchInput.svelte';
  import SelectFilter from '$lib/components/ui/SelectFilter.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { statusLabel } from '$lib/utils/profile';
  import { getRegionAbbr } from '$lib/utils/region';
  import { flagForRegion } from '$lib/utils/regions';
  import { isFreeDivision } from '$lib/utils/signupDivision';
  import { describePlacementMoves, matchesPlacementSearch } from '$lib/utils/placement';
  import type { PlacementColumn, PlacementEntry, PlacementPlayer } from '$lib/types/placement';
  import type { ProfilingSnapshot } from '$lib/types/profiling';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const flipDurationMs = 180;

  let search = $state('');
  let showConfirm = $state(false);
  let saving = $state(false);
  let saveForm: HTMLFormElement | undefined = $state();
  let lastFormResult: ActionData = null;
  let snapshots = $state<Record<string, ProfilingSnapshot | null>>({});
  let snapshotStatus = $state<Record<string, 'loading' | 'ready' | 'error'>>({});
  const requestedSnapshots = new Set<string>();
  let peek = $state<{ name: string; steamId: string; x: number; y: number } | null>(null);

  function boardFromData(): PlacementColumn[] {
    return data.divisions.map((division) => ({
      ...division,
      items: data.entries
        .filter((entry) => entry.divisionId === division.id)
        .map((entry) => ({ ...entry, players: [...entry.players] })),
    }));
  }

  let columns = $derived(boardFromData());
  const originalByTeam = $derived(
    Object.fromEntries(data.entries.map((entry) => [entry.id, entry.divisionId])),
  );

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if ('error' in form && form.error) {
        toast.error(form.error);
      }
    }
  });

  const formatOptions = $derived(
    data.formats.map((format) => ({ value: String(format.id), label: format.name })),
  );
  const regionOptions = $derived(
    data.regions.map((region) => ({ value: String(region.id), label: region.name })),
  );

  const formatValue = $derived(data.formatId != null ? String(data.formatId) : '');
  const regionValue = $derived(data.regionId != null ? String(data.regionId) : '');

  const moves = $derived(describePlacementMoves(columns, originalByTeam));
  const dirty = $derived(moves.length > 0);
  const placementsJson = $derived(
    JSON.stringify(moves.map((move) => ({ teamId: move.teamId, divisionId: move.toDivisionId }))),
  );
  const hasPaymentEffects = $derived(moves.some((move) => move.effect !== 'none'));
  const searchActive = $derived(search.trim().length > 0);
  const entityLabel = $derived(data.isIndividual ? 'players' : 'teams');
  const regionFlagCode = $derived.by(() => {
    const region = data.regions.find((item) => item.id === data.regionId);
    return region ? flagForRegion(getRegionAbbr(region.name)) : '';
  });

  function goToScope(next: { format?: string; region?: string }) {
    const params = new URLSearchParams();
    const format = next.format ?? formatValue;
    const region = next.region ?? regionValue;
    if (format) params.set('format', format);
    if (region) params.set('region', region);
    void goto(`/admin/placement?${params.toString()}`);
  }

  function discard() {
    columns = boardFromData();
  }

  function updateColumnItems(divisionId: number, items: PlacementEntry[]) {
    columns = columns.map((column) => (column.id === divisionId ? { ...column, items } : column));
  }

  function handleConsider(divisionId: number, event: CustomEvent<DndEvent<PlacementEntry>>) {
    updateColumnItems(divisionId, event.detail.items);
  }

  function handleFinalize(divisionId: number, event: CustomEvent<DndEvent<PlacementEntry>>) {
    updateColumnItems(divisionId, event.detail.items);
  }

  function stopDrag(event: Event) {
    event.stopPropagation();
  }

  function openPeek(player: PlacementPlayer, event: MouseEvent, name = player.steamUsername) {
    event.preventDefault();
    event.stopPropagation();
    peek = { name, steamId: player.steamId, x: event.clientX, y: event.clientY };
  }

  function playerSnapshotStatus(steamId: string): 'loading' | 'ready' | 'error' {
    return snapshotStatus[steamId] ?? 'loading';
  }

  async function loadSnapshots(steamIds: string[]) {
    try {
      const res = await fetch('/api/admin/profiling/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ steamIds }),
      });
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as { data?: Record<string, ProfilingSnapshot | null> };
      const incoming = body.data ?? {};
      snapshots = { ...snapshots, ...incoming };
      snapshotStatus = {
        ...snapshotStatus,
        ...Object.fromEntries(
          steamIds.map((steamId) => [
            steamId,
            incoming[steamId] ? ('ready' as const) : ('error' as const),
          ]),
        ),
      };
    } catch {
      snapshotStatus = {
        ...snapshotStatus,
        ...Object.fromEntries(steamIds.map((steamId) => [steamId, 'error' as const])),
      };
    }
  }

  const boardSteamIds = $derived([
    ...new Set(data.entries.flatMap((entry) => entry.players.map((player) => player.steamId))),
  ]);

  $effect(() => {
    const missing = boardSteamIds.filter((steamId) => !requestedSnapshots.has(steamId));
    if (missing.length === 0) return;

    for (const steamId of missing) requestedSnapshots.add(steamId);
    untrack(() => {
      snapshotStatus = {
        ...snapshotStatus,
        ...Object.fromEntries(missing.map((steamId) => [steamId, 'loading' as const])),
      };
    });
    void loadSnapshots(missing);
  });

  function costLabel(signupCost: number): string {
    if (isFreeDivision(signupCost)) return 'Free';
    return `${data.currencySymbol}${signupCost.toFixed(2)}`;
  }

  function statusDotClass(status: string): string {
    if (status === 'READY' || status === 'PLACEMENT') return 'bg-success-400';
    if (status === 'PENDING') return 'bg-warning-400';
    if (status === 'DEAD') return 'bg-danger-400';
    return 'bg-text-muted';
  }

  function effectLabel(effect: (typeof moves)[number]['effect']): string | null {
    if (effect === 'reset-unpaid') {
      return 'Payments reset to unpaid. Ready or pending entries return to unready.';
    }
    if (effect === 'mark-exempt') {
      return 'Marked complimentary. Players who already paid get a refund notice.';
    }
    return null;
  }

  function cardHref(entry: PlacementEntry): string {
    if (data.isIndividual && entry.players[0]?.steamId) {
      return `/users/${entry.players[0].steamId}`;
    }
    return `/teams/${entry.id}`;
  }

  const itemRowPx = $derived(data.isIndividual ? 72 : 108);
  const minItemPx = 220;

  function fitItemColumns(node: HTMLElement, itemCount: number) {
    const apply = (count: number) => {
      const rowsFit = Math.max(1, Math.floor(node.clientHeight / itemRowPx));
      const widthCols = Math.max(1, Math.floor(node.clientWidth / minItemPx));
      const heightCols = Math.max(1, Math.ceil(Math.max(count, 1) / rowsFit));
      const cols = Math.max(1, Math.min(heightCols, widthCols));
      node.style.gridTemplateColumns = `repeat(${cols}, minmax(${minItemPx}px, 1fr))`;
    };

    apply(itemCount);
    const observer = new ResizeObserver(() => apply(itemCount));
    observer.observe(node);

    return {
      update(count: number) {
        itemCount = count;
        apply(itemCount);
      },
      destroy() {
        observer.disconnect();
      },
    };
  }

  const handleSave: SubmitFunction = () => {
    saving = true;
    showConfirm = false;
    return async ({ result, update }) => {
      saving = false;
      await update();
      if (result.type === 'success') {
        await invalidateAll();
      }
    };
  };
</script>

<div class="flex h-[calc(100dvh-4rem)] flex-col gap-3 overflow-hidden">
  <Card padding="sm" class="shrink-0">
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-white">Division Placement</h1>
        <p class="mt-0.5 text-sm text-text-body">
          {#if data.seasonNum != null}
            Season {data.seasonNum}
            <span class="text-text-muted">·</span>
          {/if}
          {#if dirty}
            {moves.length}
            {moves.length === 1 ? 'change' : 'changes'} waiting to save
          {:else}
            Drag {entityLabel} between divisions, then save
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!dirty || saving} onclick={discard}
          >Discard</Button
        >
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onclick={() => (showConfirm = true)}
        >
          Save
        </Button>
      </div>
    </div>
    <div class="flex flex-wrap items-end gap-3">
      <div class="w-40">
        <label for="placement-format" class="mb-1.5 block text-sm font-medium text-text-body"
          >Format</label
        >
        <SelectFilter
          id="placement-format"
          value={formatValue}
          options={formatOptions}
          showAllOption={false}
          onChange={(value) => goToScope({ format: value, region: regionValue })}
        />
      </div>
      <div class="w-40">
        <label for="placement-region" class="mb-1.5 block text-sm font-medium text-text-body"
          >Region</label
        >
        <SelectFilter
          id="placement-region"
          value={regionValue}
          options={regionOptions}
          showAllOption={false}
          onChange={(value) => goToScope({ format: formatValue, region: value })}
        />
      </div>
      <div class="min-w-48 flex-1">
        <label for="placement-search" class="mb-1.5 block text-sm font-medium text-text-body"
          >Search</label
        >
        <SearchInput
          id="placement-search"
          bind:value={search}
          placeholder={data.isIndividual ? 'Name or Steam name' : 'Team, acronym, or player'}
        />
      </div>
    </div>
    <FormError
      error={form && 'error' in form ? form.error : null}
      success={form?.success ? (form.message ?? null) : null}
    />
  </Card>

  {#if data.seasonId == null}
    <Card>
      <p class="text-text-body">
        No current season for this format and region. Set the active season in Global settings.
      </p>
    </Card>
  {:else if data.divisions.length === 0}
    <Card>
      <p class="text-text-body">
        This format and region has no visible divisions. Create them in League first.
      </p>
    </Card>
  {:else}
    <div class="flex min-h-0 flex-1 gap-2 overflow-hidden">
      {#each columns as column (column.id)}
        {@const visibleCount = column.items.filter((item) =>
          matchesPlacementSearch(item, search),
        ).length}
        <Card
          padding="none"
          class="h-full min-h-0 min-w-0 flex-1 [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-col"
        >
          <div class="shrink-0 border-b border-border-default px-2 py-1.5">
            <div class="flex items-center justify-between gap-1.5">
              <div class="flex min-w-0 items-center gap-2">
                {#if regionFlagCode}
                  <FlagIcon code={regionFlagCode} class="h-4 w-6 rounded-sm" />
                {/if}
                <h2 class="truncate text-lg font-bold text-white">{column.name}</h2>
              </div>
              <Badge color={isFreeDivision(column.signupCost) ? 'zinc' : 'green'}
                >{costLabel(column.signupCost)}</Badge
              >
            </div>
            <p class="text-[10px] leading-tight text-text-muted">
              {searchActive ? `${visibleCount} matching · ` : ''}{column.items.length}
              {column.items.length === 1 ? (data.isIndividual ? 'player' : 'team') : entityLabel}
            </p>
          </div>
          <div
            class="grid min-h-0 flex-1 content-start gap-1 overflow-x-hidden overflow-y-auto p-1.5"
            use:fitItemColumns={column.items.length}
            use:dndzone={{
              items: column.items,
              type: 'placement-board',
              flipDurationMs,
              dragDisabled: saving,
            }}
            onconsider={(event) => handleConsider(column.id, event)}
            onfinalize={(event) => handleFinalize(column.id, event)}
          >
            {#each column.items as entry (entry.id)}
              {@const matches = matchesPlacementSearch(entry, search)}
              <div
                class="flex min-w-0 items-start gap-1.5 rounded border border-border-default bg-surface-input px-1.5 py-1.5 {saving
                  ? 'cursor-default'
                  : 'cursor-grab'} {searchActive && !matches ? 'opacity-40' : ''}"
                role="group"
                title="Right-click a player for profiling details"
                onpointerdown={(event) => {
                  if (event.button === 2) event.stopPropagation();
                }}
                oncontextmenu={(event) => {
                  if (!data.isIndividual) return;
                  const player = entry.players[0];
                  if (!player) return;
                  openPeek(player, event, entry.name);
                }}
              >
                {#if entry.avatar}
                  <img
                    src={entry.avatar}
                    alt=""
                    class="mt-0.5 h-5 w-5 shrink-0 rounded object-cover"
                  />
                {:else}
                  <div
                    class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-hover text-[10px] font-semibold text-text-label"
                  >
                    {entry.name.charAt(0).toUpperCase()}
                  </div>
                {/if}
                <div class="min-w-0 flex-1">
                  <a
                    href={cardHref(entry)}
                    class="block truncate text-xs leading-tight text-white hover:text-primary-400"
                    title={entry.acronym ? `${entry.name} [${entry.acronym}]` : entry.name}
                    onpointerdown={stopDrag}
                  >
                    {entry.name}
                    {#if entry.acronym}
                      <span class="text-text-muted">[{entry.acronym}]</span>
                    {/if}
                  </a>
                  {#if data.isIndividual}
                    {@const player = entry.players[0]}
                    {#if player}
                      <ProfilingCardFacts
                        snapshot={snapshots[player.steamId] ?? null}
                        status={playerSnapshotStatus(player.steamId)}
                      />
                    {/if}
                  {:else if entry.players.length > 0}
                    <div class="mt-0.5 space-y-1">
                      {#each entry.players as player (player.steamId)}
                        <div
                          class="min-w-0"
                          role="group"
                          title="Right-click for profiling details"
                          oncontextmenu={(event) => openPeek(player, event)}
                        >
                          <a
                            href="/users/{player.steamId}"
                            class="block truncate text-[10px] leading-tight text-text-muted hover:text-white"
                            title={player.steamUsername}
                            onpointerdown={stopDrag}
                          >
                            {player.steamUsername}
                          </a>
                          <ProfilingCardFacts
                            snapshot={snapshots[player.steamId] ?? null}
                            status={playerSnapshotStatus(player.steamId)}
                          />
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
                <span
                  class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full {statusDotClass(entry.status)}"
                  title={statusLabel(entry.status)}
                ></span>
              </div>
            {/each}
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</div>

<form bind:this={saveForm} method="POST" action="?/save" use:enhance={handleSave}>
  {#if data.seasonId != null && data.regionId != null && data.formatId != null}
    <input type="hidden" name="seasonId" value={data.seasonId} />
    <input type="hidden" name="regionId" value={data.regionId} />
    <input type="hidden" name="formatId" value={data.formatId} />
    <input type="hidden" name="placements" value={placementsJson} />
  {/if}
</form>

{#if peek}
  <ProfilingPeek
    name={peek.name}
    steamId={peek.steamId}
    x={peek.x}
    y={peek.y}
    snapshot={snapshots[peek.steamId] ?? null}
    status={playerSnapshotStatus(peek.steamId)}
    onClose={() => (peek = null)}
  />
{/if}

<ConfirmDialog
  open={showConfirm}
  title="Save division placement"
  description={hasPaymentEffects
    ? 'Some moves cross a free and paid division. Review the payment effects before saving.'
    : `Save ${moves.length} division ${moves.length === 1 ? 'change' : 'changes'}?`}
  confirmLabel="Save placements"
  variant={hasPaymentEffects ? 'warning' : 'info'}
  isLoading={saving}
  onConfirm={() => saveForm?.requestSubmit()}
  onCancel={() => (showConfirm = false)}
>
  {#snippet preview()}
    <ul class="max-h-64 space-y-3 overflow-y-auto text-sm">
      {#each moves as move (move.teamId)}
        <li>
          <p class="font-medium text-white">
            {move.teamName}
            <span class="font-normal text-text-body">
              {move.fromDivisionName} → {move.toDivisionName}
            </span>
          </p>
          {#if effectLabel(move.effect)}
            <p class="mt-0.5 text-xs text-warning-400">{effectLabel(move.effect)}</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/snippet}
</ConfirmDialog>
