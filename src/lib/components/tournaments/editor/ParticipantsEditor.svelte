<script lang="ts">
  import { onDestroy } from 'svelte';
  import { resolve } from '$app/paths';
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import { nextDraftId } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import {
    normalizeParticipantName,
    participantDuplicateMessage,
    searchParticipantUsers,
  } from '$lib/utils/tournamentParticipantSearch';
  import { steamId64FromAnyFormat } from '$lib/utils/steamid';

  type EditorUser = { steamId: string; name: string; avatar: string | null };

  const SEARCH_DEBOUNCE_MS = 300;

  let { draft = $bindable() }: { draft: EventDraftPayload } = $props();

  let searchQuery = $state('');
  let selectedSteamId = $state('');
  let addError = $state('');
  let renameValues = $state<Record<string, string>>({});
  let renameErrors = $state<Record<string, string>>({});
  let searchUsers = $state.raw<EditorUser[]>([]);
  let searchLoading = $state(false);
  let searchError = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  let searchController: AbortController | null = null;
  let searchRequestId = 0;

  const searchResults = $derived(
    searchParticipantUsers(searchUsers, searchQuery, draft.participants),
  );

  const searchResultOptions = $derived(
    searchResults.map((user) => ({
      value: user.steamId,
      label: `${user.name} (${user.steamId})`,
    })),
  );

  const exactSearchUser = $derived.by(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return null;
    const normalizedSteamId = steamId64FromAnyFormat(trimmedQuery);
    const normalizedName = normalizeParticipantName(trimmedQuery);
    return (
      searchUsers.find(
        (user) =>
          normalizeParticipantName(user.name) === normalizedName ||
          (normalizedSteamId !== null && user.steamId === normalizedSteamId),
      ) ?? null
    );
  });

  const exactSearchUserDuplicate = $derived(
    exactSearchUser
      ? participantDuplicateMessage(draft.participants, {
          steamId: exactSearchUser.steamId,
          displayName: exactSearchUser.name,
        })
      : null,
  );

  function cancelParticipantSearch() {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchController?.abort();
    searchController = null;
  }

  function clearParticipantSearch() {
    searchRequestId += 1;
    cancelParticipantSearch();
    searchQuery = '';
    selectedSteamId = '';
    addError = '';
    searchUsers = [];
    searchLoading = false;
    searchError = '';
  }

  async function fetchParticipantSearch(query: string, requestId: number) {
    const controller = new AbortController();
    searchController = controller;

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(
        `${resolve('/api/admin/tournament-participants/search')}?${params}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error('Participant search failed.');

      const payload = (await response.json()) as { success?: boolean; data?: EditorUser[] };
      if (!payload.success || !Array.isArray(payload.data)) {
        throw new Error('Participant search returned an invalid response.');
      }
      if (requestId !== searchRequestId) return;

      searchUsers = payload.data;
    } catch (error) {
      if (controller.signal.aborted || requestId !== searchRequestId) return;
      searchUsers = [];
      searchError =
        error instanceof Error ? error.message : 'Unable to search participants right now.';
    } finally {
      if (requestId === searchRequestId) searchLoading = false;
      if (searchController === controller) searchController = null;
    }
  }

  function handleSearchInput(value: string | null) {
    searchQuery = value ?? '';
    addError = '';
    selectedSteamId = '';
    searchUsers = [];
    searchError = '';
    searchRequestId += 1;
    cancelParticipantSearch();

    const query = searchQuery.trim();
    if (!query) {
      searchLoading = false;
      return;
    }

    searchLoading = true;
    const requestId = searchRequestId;
    searchTimer = setTimeout(() => {
      searchTimer = null;
      void fetchParticipantSearch(query, requestId);
    }, SEARCH_DEBOUNCE_MS);
  }

  function addLinkedParticipant() {
    const user = searchUsers.find((candidate) => candidate.steamId === selectedSteamId);
    if (!user) return;
    const duplicateMessage = participantDuplicateMessage(draft.participants, {
      steamId: user.steamId,
      displayName: user.name,
    });
    if (duplicateMessage) {
      addError = duplicateMessage;
      return;
    }
    draft.participants.push({
      id: nextDraftId('participant'),
      steamId: user.steamId,
      displayName: user.name,
      seed: draft.participants.length + 1,
      eliminated: false,
      hidden: false,
    });
    clearParticipantSearch();
  }

  function addUnlinkedParticipant() {
    const displayName = searchQuery.trim().replace(/\s+/g, ' ');
    if (!displayName) {
      addError = 'Enter a participant name first.';
      return;
    }
    const duplicateMessage = participantDuplicateMessage(draft.participants, {
      steamId: null,
      displayName,
    });
    if (duplicateMessage) {
      addError = duplicateMessage;
      return;
    }
    draft.participants.push({
      id: nextDraftId('participant'),
      steamId: null,
      displayName,
      seed: draft.participants.length + 1,
      eliminated: false,
      hidden: false,
    });
    clearParticipantSearch();
  }

  function removeParticipant(id: string) {
    draft.participants = draft.participants.filter((candidate) => candidate.id !== id);
    draft.placements = draft.placements.filter((placement) => placement.participantId !== id);
    for (const stage of draft.stages) {
      for (const match of stage.matches) {
        match.players = match.players.filter((player) => player.participantId !== id);
      }
    }
  }

  function renameParticipant(id: string, value: string | null) {
    const participant = draft.participants.find((candidate) => candidate.id === id);
    if (!participant) return;

    renameValues[id] = value ?? '';
    const displayName = value?.trim() ?? '';
    if (!displayName) {
      renameErrors[id] = 'Display name cannot be empty.';
      return;
    }

    const duplicateMessage = participantDuplicateMessage(
      draft.participants,
      { steamId: participant.steamId, displayName },
      participant.id,
    );
    if (duplicateMessage) {
      renameErrors[id] = duplicateMessage;
      return;
    }

    renameErrors[id] = '';
    participant.displayName = displayName;
    for (const stage of draft.stages) {
      for (const match of stage.matches) {
        for (const player of match.players) {
          if (player.participantId === participant.id) player.displayName = displayName;
        }
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

  onDestroy(cancelParticipantSearch);
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

  <FormInput
    label="Search participants"
    name="participant-search"
    value={searchQuery}
    placeholder="Username, Steam ID, profile URL, or a new name"
    hint="Search site users by username, Steam64, Steam2, Steam3, or Steam profile URL."
    onInput={handleSearchInput}
  />

  {#if searchQuery.trim()}
    <div class="rounded-lg border border-border-default bg-surface-input p-4">
      <div class="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <FormSelect
          label="Site-user results"
          name="participant-user"
          value={selectedSteamId}
          options={searchResultOptions}
          placeholder={searchLoading
            ? 'Searching site users...'
            : searchResults.length > 0
              ? 'Select a site user'
              : 'No matching site users'}
          disabled={searchLoading || searchResults.length === 0}
          onChange={(value) => {
            selectedSteamId = value;
            addError = '';
          }}
        />
        <Button
          type="button"
          variant="primary"
          class="mb-6"
          disabled={!selectedSteamId}
          onclick={addLinkedParticipant}
        >
          Add linked user
        </Button>
      </div>

      {#if searchLoading}
        <p class="text-sm text-text-body" aria-live="polite">Searching site users...</p>
      {:else if searchError}
        <p class="text-sm text-danger-400" aria-live="polite">{searchError}</p>
      {:else if searchResults.length === 0}
        <p class="text-sm text-text-muted" aria-live="polite">
          No available matching site users found.
        </p>
      {/if}

      {#if exactSearchUserDuplicate}
        <p class="mt-3 text-sm text-danger-400" aria-live="polite">
          {exactSearchUserDuplicate}
        </p>
      {/if}

      {#if !searchLoading && !exactSearchUser}
        <div
          class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-4"
        >
          <p class="text-sm text-text-body">
            {searchError
              ? 'Site-user search is unavailable. You can still add this participant as unlinked.'
              : `No exact site-user identity matches “${searchQuery.trim()}”.`}
          </p>
          <Button type="button" variant="secondary" onclick={addUnlinkedParticipant}>
            Add “{searchQuery.trim()}” as unlinked
          </Button>
        </div>
      {/if}

      {#if addError}
        <p class="mt-3 text-sm text-danger-400" aria-live="polite">{addError}</p>
      {/if}
    </div>
  {/if}

  {#if draft.participants.length === 0}
    <p
      class="mt-4 rounded-lg border border-border-default bg-surface-input p-4 text-sm text-text-muted"
    >
      No participants added.
    </p>
  {:else}
    <div class="mt-4 space-y-3">
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
                {#if participant.steamId}
                  <p class="truncate text-xs text-text-muted">Steam ID: {participant.steamId}</p>
                {:else}
                  <Badge color="zinc">Unlinked</Badge>
                {/if}
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

          <div class="mt-4 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            <FormInput
              label="Display name"
              name="participant-name-{participant.id}"
              value={renameValues[participant.id] ?? participant.displayName}
              error={renameErrors[participant.id]}
              onInput={(value) => renameParticipant(participant.id, value)}
            />
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
