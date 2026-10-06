<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData, PageData } from './$types';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
  import { toast } from '$lib/state/toast.svelte';
  import { formatDateTime } from '$lib/utils/datetime';
  import { formatPlayoffRound } from '$lib/utils/playoffs';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const draft = $derived(data.draft);
  const isEditable = $derived(draft.status === 'DRAFT');

  let confirmPublish = $state(false);
  let confirmDiscard = $state(false);
  let isSubmitting = $state(false);
  let publishForm: HTMLFormElement | undefined = $state();
  let discardForm: HTMLFormElement | undefined = $state();
  let lastFormResult: ActionData = null;

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.error) toast.error(form.error);
    }
  });

  const roundLabel = $derived(
    draft.isPlayoff && draft.playoffRound != null
      ? formatPlayoffRound(draft.playoffRound)
      : draft.weekNo != null
        ? `Week ${draft.weekNo}`
        : 'Unscheduled',
  );
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <a href="/admin/matches" class="text-sm text-text-muted hover:text-white"
        >← Match Management</a
      >
      <h1 class="text-3xl font-bold text-white mt-2 mb-2">Match Set Draft</h1>
      <p class="text-text-body">
        {draft.divisionName} · {draft.regionName} · {draft.formatName} Season {draft.seasonNo}
      </p>
    </div>
    <Badge
      color={draft.status === 'DRAFT' ? 'yellow' : draft.status === 'PUBLISHED' ? 'green' : 'zinc'}
      >{draft.status === 'DRAFT' ? 'Awaiting publish' : draft.status}</Badge
    >
  </div>

  <Card>
    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
      <div>
        <dt class="text-text-muted">Round</dt>
        <dd class="text-white font-medium">{roundLabel}</dd>
      </div>
      <div>
        <dt class="text-text-muted">Best of</dt>
        <dd class="text-white font-medium">{draft.boSeries}</dd>
      </div>
      <div>
        <dt class="text-text-muted">Created by</dt>
        <dd class="text-white font-medium">{draft.createdByName}</dd>
      </div>
      <div>
        <dt class="text-text-muted">Saved</dt>
        <dd class="text-white font-medium">{formatDateTime(draft.updatedAt)}</dd>
      </div>
      {#if draft.arenaName}
        <div>
          <dt class="text-text-muted">Arena</dt>
          <dd class="text-white font-medium">{draft.arenaName}</dd>
        </div>
      {/if}
      {#if draft.mapBanPoolName}
        <div>
          <dt class="text-text-muted">Map ban pool</dt>
          <dd class="text-white font-medium">{draft.mapBanPoolName}</dd>
        </div>
      {/if}
      {#if draft.matchDateTime}
        <div>
          <dt class="text-text-muted">Default match time</dt>
          <dd class="text-white font-medium">
            {draft.matchDateTime}
            {#if draft.matchTimezone}
              ({draft.matchTimezone})
            {/if}
          </dd>
        </div>
      {/if}
    </dl>
  </Card>

  <Card padding="lg">
    <h2 class="text-xl font-bold text-white mb-4">
      {draft.pairings.length} match{draft.pairings.length === 1 ? '' : 'es'}
    </h2>
    <div class="space-y-3">
      {#each draft.pairings as pairing, i (`${pairing.home.id}-${pairing.away.id}`)}
        <div
          class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-center bg-surface-input/50 border border-border-input rounded-lg p-4"
        >
          <div>
            <div class="text-xs text-text-muted mb-1">Match {i + 1} · Home</div>
            <div class="text-white font-semibold">{pairing.home.name}</div>
            <div class="text-xs text-text-body">
              #{pairing.home.seed} · {pairing.home.wins}W-{pairing.home.losses}L
            </div>
          </div>
          <div class="text-text-muted text-sm font-medium text-center">vs</div>
          <div class="md:text-right">
            <div class="text-xs text-text-muted mb-1">Away</div>
            <div class="text-white font-semibold">{pairing.away.name}</div>
            <div class="text-xs text-text-body">
              #{pairing.away.seed} · {pairing.away.wins}W-{pairing.away.losses}L
            </div>
          </div>
        </div>
      {/each}
    </div>

    {#if draft.byeTeams.length > 0}
      <div class="mt-4 p-3 rounded-lg bg-warning-500/10 border border-warning-500/30">
        <p class="text-sm text-warning-300 font-medium mb-1">Bye week</p>
        <p class="text-text-body text-sm">
          {draft.byeTeams.map((team) => team.name).join(', ')}
        </p>
      </div>
    {/if}
  </Card>

  {#if isEditable}
    <div class="flex flex-col sm:flex-row gap-3">
      <Button variant="secondary" href="/admin/matches/create?draftId={draft.id}" class="flex-1">
        Edit draft
      </Button>
      <Button variant="danger" onclick={() => (confirmDiscard = true)} class="flex-1">
        Discard
      </Button>
      {#if data.isStrictAdmin}
        <Button variant="success" onclick={() => (confirmPublish = true)} class="flex-1">
          Publish matches
        </Button>
      {:else}
        <p class="text-sm text-text-muted sm:self-center">Only admins can publish this draft.</p>
      {/if}
    </div>
  {/if}
</div>

<form
  class="hidden"
  method="POST"
  action="?/publish"
  bind:this={publishForm}
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update }) => {
      await update();
      isSubmitting = false;
    };
  }}
></form>
<form
  class="hidden"
  method="POST"
  action="?/discard"
  bind:this={discardForm}
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update }) => {
      await update();
      isSubmitting = false;
    };
  }}
></form>

<ConfirmDialog
  open={confirmPublish}
  title="Publish match set"
  description="This creates live matches and notifies the teams. Players will see them immediately."
  confirmLabel="Publish"
  variant="success"
  isLoading={isSubmitting}
  onConfirm={() => {
    confirmPublish = false;
    publishForm?.requestSubmit();
  }}
  onCancel={() => (confirmPublish = false)}
/>

<ConfirmDialog
  open={confirmDiscard}
  title="Discard draft"
  description="This draft will be discarded and will no longer be available to publish."
  confirmLabel="Discard"
  variant="danger"
  isLoading={isSubmitting}
  onConfirm={() => {
    confirmDiscard = false;
    discardForm?.requestSubmit();
  }}
  onCancel={() => (confirmDiscard = false)}
/>
