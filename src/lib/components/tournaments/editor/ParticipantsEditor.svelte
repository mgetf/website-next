<script lang="ts">
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import { nextDraftId } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  type EditorUser = { steamId: string; name: string; avatar: string | null };

  let {
    draft = $bindable(),
    users,
  }: {
    draft: EventDraftPayload;
    users: EditorUser[];
  } = $props();

  let selectedSteamId = $state('');

  const userOptions = $derived(
    users
      .filter(
        (user) => !draft.participants.some((participant) => participant.steamId === user.steamId),
      )
      .map((user) => ({ value: user.steamId, label: user.name })),
  );

  function addParticipant() {
    const user = users.find((candidate) => candidate.steamId === selectedSteamId);
    if (!user) return;
    draft.participants.push({
      id: nextDraftId('participant'),
      steamId: user.steamId,
      displayName: user.name,
      seed: draft.participants.length + 1,
      eliminated: false,
      hidden: false,
    });
    selectedSteamId = '';
  }

  function removeParticipant(id: string) {
    const participant = draft.participants.find((candidate) => candidate.id === id);
    if (!participant) return;
    draft.participants = draft.participants.filter((candidate) => candidate.id !== id);
    draft.placements = draft.placements.filter(
      (placement) => placement.steamId !== participant.steamId,
    );
    for (const stage of draft.stages) {
      for (const match of stage.matches) {
        match.players = match.players.filter((player) => player.steamId !== participant.steamId);
      }
    }
  }

  function moveParticipant(id: string, direction: -1 | 1) {
    const index = draft.participants.findIndex((participant) => participant.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= draft.participants.length) return;
    const reordered = [...draft.participants];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    draft.participants = reordered.map((participant, participantIndex) => ({
      ...participant,
      seed: participantIndex + 1,
    }));
  }

  function handleKeydown(event: KeyboardEvent, id: string) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveParticipant(id, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveParticipant(id, 1);
    }
  }

  function positiveInteger(value: string | null): number | null {
    if (!value?.trim()) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
</script>

<Card>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold text-white">Participants</h2>
      <p class="mt-1 text-sm text-text-muted">
        Use Alt+Arrow Up or Alt+Arrow Down to reorder a focused participant.
      </p>
    </div>
    <Badge color="zinc">{draft.participants.length}</Badge>
  </div>

  <div class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <FormSelect
      label="Add participant"
      name="participant-user"
      bind:value={selectedSteamId}
      options={userOptions}
      placeholder="Select a user"
    />
    <Button
      type="button"
      variant="primary"
      class="mb-6"
      disabled={!selectedSteamId}
      onclick={addParticipant}
    >
      Add
    </Button>
  </div>

  {#if draft.participants.length === 0}
    <p class="rounded-lg border border-border-default bg-surface-input p-4 text-sm text-text-muted">
      No participants added.
    </p>
  {:else}
    <div class="space-y-3">
      {#each draft.participants as participant, index (participant.id)}
        <div class="rounded-lg border border-border-default bg-surface-input p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-sm font-semibold text-text-label"
              >
                {index + 1}
              </span>
              <div class="min-w-0">
                <p class="truncate font-medium text-white">{participant.displayName}</p>
                <p class="truncate text-xs text-text-muted">{participant.steamId}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === 0}
                aria-label="Move {participant.displayName} up"
                onclick={() => moveParticipant(participant.id, -1)}
                onkeydown={(event: KeyboardEvent) => handleKeydown(event, participant.id)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === draft.participants.length - 1}
                aria-label="Move {participant.displayName} down"
                onclick={() => moveParticipant(participant.id, 1)}
                onkeydown={(event: KeyboardEvent) => handleKeydown(event, participant.id)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label="Remove {participant.displayName}"
                onclick={() => removeParticipant(participant.id)}
              >
                Remove
              </Button>
            </div>
          </div>

          <div class="mt-4 grid gap-x-4 sm:grid-cols-3">
            <FormInput
              label="Seed"
              name="participant-seed-{participant.id}"
              type="number"
              value={participant.seed === null ? '' : String(participant.seed)}
              onInput={(value) => (participant.seed = positiveInteger(value))}
            />
            <label class="flex items-center gap-2 pb-6 text-sm text-text-body">
              <input
                type="checkbox"
                bind:checked={participant.eliminated}
                class="h-4 w-4 rounded border-border-input bg-surface-card text-primary-600 focus:ring-primary-500"
              />
              Eliminated
            </label>
            <label class="flex items-center gap-2 pb-6 text-sm text-text-body">
              <input
                type="checkbox"
                bind:checked={participant.hidden}
                class="h-4 w-4 rounded border-border-input bg-surface-card text-primary-600 focus:ring-primary-500"
              />
              Hidden
            </label>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</Card>
