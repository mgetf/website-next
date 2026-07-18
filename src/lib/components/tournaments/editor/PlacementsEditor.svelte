<script lang="ts">
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import { nextDraftId } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { draft = $bindable() }: { draft: EventDraftPayload } = $props();

  let selectedSteamId = $state('');

  const availableParticipants = $derived(
    draft.participants
      .filter(
        (participant) =>
          !draft.placements.some((placement) => placement.steamId === participant.steamId),
      )
      .map((participant) => ({
        value: participant.steamId,
        label: participant.displayName,
      })),
  );

  function addPlacement() {
    if (!selectedSteamId) return;
    draft.placements.push({
      id: nextDraftId('placement'),
      steamId: selectedSteamId,
      placement: draft.placements.length + 1,
    });
    selectedSteamId = '';
  }

  function removePlacement(id: string) {
    draft.placements = draft.placements.filter((placement) => placement.id !== id);
  }

  function participantName(steamId: string): string {
    return (
      draft.participants.find((participant) => participant.steamId === steamId)?.displayName ??
      steamId
    );
  }

  function positiveInteger(value: string | null): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }
</script>

<Card>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold text-white">Placements</h2>
      <p class="mt-1 text-sm text-text-muted">Assign final positions to participants.</p>
    </div>
    <Badge color="zinc">{draft.placements.length}</Badge>
  </div>

  <div class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
    <FormSelect
      label="Participant"
      name="placement-participant"
      bind:value={selectedSteamId}
      options={availableParticipants}
      placeholder="Select a participant"
    />
    <Button type="button" class="mb-6" disabled={!selectedSteamId} onclick={addPlacement}>
      Add placement
    </Button>
  </div>

  <div class="space-y-3">
    {#each draft.placements as placement (placement.id)}
      <div class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
        <FormSelect
          label="Participant"
          name="placement-user-{placement.id}"
          value={placement.steamId}
          options={draft.participants.map((participant) => ({
            value: participant.steamId,
            label: participant.displayName,
          }))}
          required
          onChange={(value) => (placement.steamId = value)}
        />
        <FormInput
          label="Place"
          name="placement-rank-{placement.id}"
          type="number"
          value={String(placement.placement)}
          onInput={(value) => (placement.placement = positiveInteger(value))}
        />
        <Button
          type="button"
          variant="danger"
          size="sm"
          class="mb-6"
          aria-label="Remove placement for {participantName(placement.steamId)}"
          onclick={() => removePlacement(placement.id)}
        >
          Remove
        </Button>
      </div>
    {/each}
  </div>
</Card>
