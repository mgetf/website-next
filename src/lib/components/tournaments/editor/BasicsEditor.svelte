<script lang="ts">
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  let { draft = $bindable() }: { draft: EventDraftPayload } = $props();

  const typeOptions = [
    { value: 'CUP', label: 'Cup' },
    { value: 'CHAMPIONSHIP', label: 'Championship' },
    { value: 'FIGHT_NIGHT', label: 'Fight Night' },
  ];

  const statusOptions = [
    { value: 'UPCOMING', label: 'Upcoming' },
    { value: 'REGISTRATION', label: 'Registration' },
    { value: 'IN_PROGRESS', label: 'In progress' },
    { value: 'COMPLETED', label: 'Completed' },
  ];

  function nullable(value: string | null): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : null;
  }

  function numberValue(value: string | null): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }
</script>

<Card>
  <h2 class="mb-5 text-xl font-semibold text-white">Event details</h2>

  <div class="grid gap-x-4 md:grid-cols-2">
    <FormInput
      label="Tournament name"
      name="draft-name"
      bind:value={draft.name}
      required
      maxlength={160}
    />
    <FormSelect
      label="Tournament type"
      name="draft-type"
      bind:value={draft.type}
      options={typeOptions}
      required
    />
    <FormSelect
      label="Status"
      name="draft-status"
      bind:value={draft.status}
      options={statusOptions}
      required
    />
    <FormInput
      label="Prize pool"
      name="draft-prizepool"
      type="number"
      value={String(draft.prizepool)}
      onInput={(value) => (draft.prizepool = numberValue(value))}
    />
    <FormInput
      label="Started at"
      name="draft-started-at"
      value={draft.startedAt}
      placeholder="2026-07-18T18:00:00.000Z"
      hint="Use an ISO date and time, or leave blank."
      onInput={(value) => (draft.startedAt = nullable(value))}
    />
    <FormInput
      label="Ended at"
      name="draft-ended-at"
      value={draft.endedAt}
      placeholder="2026-07-18T22:00:00.000Z"
      hint="Use an ISO date and time, or leave blank."
      onInput={(value) => (draft.endedAt = nullable(value))}
    />
    <FormInput
      label="Avatar URL"
      name="draft-avatar"
      type="url"
      value={draft.avatar}
      onInput={(value) => (draft.avatar = nullable(value))}
    />
    <FormInput
      label="Bracket URL"
      name="draft-bracket-link"
      type="url"
      value={draft.bracketLink}
      onInput={(value) => (draft.bracketLink = nullable(value))}
    />
    <FormInput
      label="Card name"
      name="draft-card"
      value={draft.card}
      onInput={(value) => (draft.card = nullable(value))}
    />
  </div>

  <div class="mb-6">
    <label for="draft-description" class="mb-2 block text-sm font-medium text-text-label">
      Description
    </label>
    <textarea
      id="draft-description"
      name="draft-description"
      rows="4"
      bind:value={draft.description}
      class="w-full rounded-lg border border-border-input bg-surface-input px-4 py-3 text-white placeholder-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
    ></textarea>
  </div>

  <div class="flex items-center gap-3">
    <input
      id="draft-team-event"
      name="draft-team-event"
      type="checkbox"
      bind:checked={draft.isTeamEvent}
      class="h-4 w-4 rounded border-border-input bg-surface-input text-primary-600 focus:ring-primary-500"
    />
    <label for="draft-team-event" class="text-sm text-text-body">Team event</label>
  </div>
</Card>
