<script lang="ts">
  import BracketRenderer from '#lib/components/brackets/BracketRenderer.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import { playoffPreviewBracket } from '#lib/utils/playoffPreview.js';
  import type { PlayoffBracketFormat } from '#lib/utils/playoffBracket.js';
  import ChevronDown from '~icons/lucide/chevron-down';
  import ChevronUp from '~icons/lucide/chevron-up';
  import GripVertical from '~icons/lucide/grip-vertical';

  export type PickerTeam = {
    id: number;
    label: string;
    wins: number;
    losses: number;
  };

  interface Props {
    /** Every eligible team, in standings order. */
    teams: PickerTeam[];
    format: PlayoffBracketFormat;
    /** Called with the chosen teams' ids, best seed first, whenever it changes. */
    onchange: (teamIds: number[]) => void;
  }

  let { teams, format, onchange }: Props = $props();

  // The list is the seeding: top of the list is seed 1. Unticked teams sit in
  // the list but are left out of the bracket.
  let order = $state<number[]>([]);
  let selected = $state<Record<number, boolean>>({});

  $effect(() => {
    order = teams.map((team) => team.id);
    selected = Object.fromEntries(teams.map((team) => [team.id, true]));
  });

  const byId = $derived(new Map(teams.map((team) => [team.id, team])));
  const pickedIds = $derived(order.filter((id) => selected[id]));
  const preview = $derived(
    playoffPreviewBracket(
      format,
      pickedIds.flatMap((id) => {
        const team = byId.get(id);
        return team ? [{ id, label: team.label }] : [];
      }),
    ),
  );

  $effect(() => {
    onchange(pickedIds);
  });

  const isStandings = $derived(order.every((id, index) => id === teams[index]?.id));

  function seedOf(id: number): number | null {
    const index = pickedIds.indexOf(id);
    return index === -1 ? null : index + 1;
  }

  function moveTo(id: number, target: number) {
    const from = order.indexOf(id);
    if (from === -1) return;
    const next = order.filter((candidate) => candidate !== id);
    next.splice(Math.max(0, Math.min(target, next.length)), 0, id);
    order = next;
  }

  function nudge(id: number, by: -1 | 1) {
    moveTo(id, order.indexOf(id) + by);
  }

  function setAll(value: boolean) {
    selected = Object.fromEntries(teams.map((team) => [team.id, value]));
  }

  function resetOrder() {
    order = teams.map((team) => team.id);
  }

  let dragging = $state<number | null>(null);
  let overIndex = $state<number | null>(null);

  function onDragStart(event: DragEvent, id: number) {
    dragging = id;
    event.dataTransfer?.setData('text/plain', String(id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function onDragOver(event: DragEvent, index: number) {
    if (dragging === null) return;
    event.preventDefault();
    overIndex = index;
  }

  function onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    if (dragging !== null) moveTo(dragging, index);
    dragging = null;
    overIndex = null;
  }

  function onDragEnd() {
    dragging = null;
    overIndex = null;
  }
</script>

<div class="grid gap-4 lg:grid-cols-[21rem_minmax(0,1fr)]">
  <div class="min-w-0">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="text-sm text-text-body">
        {pickedIds.length} of {teams.length} teams. Drag to set the seeding.
      </p>
      <div class="flex gap-1">
        <Button type="button" variant="secondary" size="sm" onclick={() => setAll(true)}>All</Button
        >
        <Button type="button" variant="secondary" size="sm" onclick={() => setAll(false)}
          >None</Button
        >
      </div>
    </div>

    <ul
      class="max-h-[28rem] divide-y divide-border-default overflow-y-auto rounded-md border border-border-default"
    >
      {#each order as id, index (id)}
        {@const team = byId.get(id)}
        {@const seed = seedOf(id)}
        {#if team}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="flex items-center gap-1.5 px-2 py-1.5 {dragging === id
              ? 'opacity-40'
              : ''} {overIndex === index && dragging !== null && dragging !== id
              ? 'border-t-2 border-primary-500'
              : ''} {selected[id] ? '' : 'opacity-60'}"
            draggable="true"
            ondragstart={(event) => onDragStart(event, id)}
            ondragover={(event) => onDragOver(event, index)}
            ondrop={(event) => onDrop(event, index)}
            ondragend={onDragEnd}
          >
            <span class="cursor-grab text-text-muted" aria-hidden="true">
              <GripVertical class="size-4" />
            </span>
            <input
              type="checkbox"
              bind:checked={selected[id]}
              class="h-4 w-4"
              aria-label="Include {team.label}"
            />
            <span class="w-8 text-right text-xs tabular-nums text-text-muted">
              {seed ? `#${seed}` : '–'}
            </span>
            <span class="flex-1 truncate text-sm text-text-heading">{team.label}</span>
            <span class="text-xs tabular-nums text-text-muted">{team.wins}-{team.losses}</span>
            <span class="flex flex-col">
              <button
                type="button"
                class="text-text-muted hover:text-text-heading disabled:opacity-30"
                aria-label="Move {team.label} up"
                disabled={index === 0}
                onclick={() => nudge(id, -1)}><ChevronUp class="size-3.5" /></button
              >
              <button
                type="button"
                class="text-text-muted hover:text-text-heading disabled:opacity-30"
                aria-label="Move {team.label} down"
                disabled={index === order.length - 1}
                onclick={() => nudge(id, 1)}><ChevronDown class="size-3.5" /></button
              >
            </span>
          </li>
        {/if}
      {/each}
    </ul>

    <div class="mt-2 flex justify-end">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isStandings}
        onclick={resetOrder}>Reset to standings</Button
      >
    </div>
  </div>

  <div class="planner min-w-0 rounded-md border border-border-default p-2">
    {#if preview}
      <BracketRenderer data={preview} />
    {:else}
      <p class="p-6 text-center text-sm text-text-muted">
        Pick at least two teams to see the bracket.
      </p>
    {/if}
  </div>
</div>

<style>
  .planner :global(.bracket-viewport) {
    max-height: 30rem;
  }
</style>
