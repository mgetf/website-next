<script lang="ts">
  import type {
    EventDraftPayload,
    EventRevisionSummary,
    ValidationIssue,
  } from '$lib/types/tournament-editor';
  import { enhance } from '$app/forms';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

  let {
    payload,
    revision = $bindable(),
    revisions,
    blocking,
    publishedRevision,
    onSaved,
  }: {
    payload: EventDraftPayload;
    revision: number;
    revisions: EventRevisionSummary[];
    blocking: boolean;
    publishedRevision: string | null;
    onSaved: (issues: ValidationIssue[]) => void;
  } = $props();

  let summary = $state('');
  let saving = $state(false);
  let publishing = $state(false);
  let restoring = $state(false);
  let showPublishConfirm = $state(false);
  let restoreRevision = $state<EventRevisionSummary | null>(null);

  const serializedPayload = $derived(JSON.stringify(payload));

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function submitForm(id: string) {
    const form = document.getElementById(id);
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }
</script>

<Card>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold text-white">Save and publish</h2>
      <p class="mt-1 text-sm text-text-muted">Current draft revision: {revision}</p>
    </div>
    {#if publishedRevision}
      <Badge color="green">Published revision {publishedRevision}</Badge>
    {/if}
  </div>

  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      saving = true;
      return async ({ result, update }) => {
        if (result.type === 'success') {
          const response = result.data as {
            data?: { revision?: number; issues?: ValidationIssue[] };
          };
          if (typeof response.data?.revision === 'number') revision = response.data.revision;
          onSaved(response.data?.issues ?? []);
        }
        await update({ reset: false, invalidateAll: false });
        saving = false;
      };
    }}
    class="mb-5"
  >
    <input type="hidden" name="payload" value={serializedPayload} />
    <input type="hidden" name="expectedRevision" value={revision} />
    <Button type="submit" variant="secondary" disabled={saving || publishing || restoring}>
      {saving ? 'Saving...' : 'Save draft'}
    </Button>
  </form>

  <div class="mb-5">
    <label for="publish-summary" class="mb-2 block text-sm font-medium text-text-label">
      Revision summary
    </label>
    <textarea
      id="publish-summary"
      name="publish-summary"
      rows="3"
      maxlength="500"
      bind:value={summary}
      placeholder="Describe the published changes"
      class="w-full rounded-lg border border-border-input bg-surface-input px-4 py-3 text-white placeholder-text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500"
    ></textarea>
  </div>

  <form
    id="publish-tournament-form"
    method="POST"
    action="?/publish"
    use:enhance={() => {
      publishing = true;
      return async ({ update }) => {
        await update();
        publishing = false;
        showPublishConfirm = false;
      };
    }}
  >
    <input type="hidden" name="payload" value={serializedPayload} />
    <input type="hidden" name="expectedRevision" value={revision} />
    <input type="hidden" name="summary" value={summary} />
  </form>

  <Button
    type="button"
    variant="success"
    disabled={blocking || saving || publishing || restoring}
    aria-label={blocking ? 'Resolve validation errors before publishing' : 'Publish tournament'}
    onclick={() => (showPublishConfirm = true)}
  >
    Publish tournament
  </Button>
  {#if blocking}
    <p class="mt-2 text-xs text-danger-400">Resolve all validation errors before publishing.</p>
  {/if}
</Card>

<Card>
  <div class="mb-4 flex items-center justify-between gap-3">
    <h2 class="text-xl font-semibold text-white">Published revisions</h2>
    <Badge color="zinc">{revisions.length}</Badge>
  </div>

  {#if revisions.length === 0}
    <p class="text-sm text-text-muted">This tournament has not been published yet.</p>
  {:else}
    <div class="space-y-3">
      {#each revisions as item (item.id)}
        <div
          class="flex flex-col gap-3 border-b border-border-default pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <div class="flex items-center gap-2">
              <p class="font-medium text-white">Revision {item.revision}</p>
              <Badge color="green">Published</Badge>
            </div>
            <p class="mt-1 text-xs text-text-muted">
              {formatDate(item.publishedAt)}
              {#if item.publishedByName}
                by {item.publishedByName}
              {/if}
            </p>
            {#if item.summary}
              <p class="mt-2 text-sm text-text-body">{item.summary}</p>
            {/if}
          </div>
          <Button
            type="button"
            size="sm"
            variant="warning"
            disabled={saving || publishing || restoring}
            aria-label="Restore published revision {item.revision}"
            onclick={() => (restoreRevision = item)}
          >
            Restore
          </Button>
        </div>
      {/each}
    </div>
  {/if}
</Card>

<form
  id="restore-tournament-form"
  method="POST"
  action="?/restore"
  use:enhance={() => {
    restoring = true;
    return async ({ update }) => {
      await update();
      restoring = false;
      restoreRevision = null;
    };
  }}
>
  <input type="hidden" name="revisionId" value={restoreRevision?.id ?? ''} />
  <input type="hidden" name="expectedRevision" value={revision} />
</form>

<ConfirmDialog
  open={showPublishConfirm}
  title="Publish tournament"
  description="This will replace the public tournament data with the current in-memory draft."
  confirmLabel="Publish"
  loadingLabel="Publishing..."
  variant="success"
  isLoading={publishing}
  onConfirm={() => submitForm('publish-tournament-form')}
  onCancel={() => (showPublishConfirm = false)}
/>

<ConfirmDialog
  open={restoreRevision !== null}
  title="Restore published revision"
  description={`Restore revision ${restoreRevision?.revision ?? ''} and publish it as the current tournament state?`}
  confirmLabel="Restore revision"
  loadingLabel="Restoring..."
  variant="warning"
  isLoading={restoring}
  onConfirm={() => submitForm('restore-tournament-form')}
  onCancel={() => (restoreRevision = null)}
/>
