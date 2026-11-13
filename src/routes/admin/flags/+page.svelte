<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';
  import Card from '#lib/components/ui/Card.svelte';
  import Button from '#lib/components/ui/Button.svelte';
  import Badge from '#lib/components/ui/Badge.svelte';
  import Dialog from '#lib/components/ui/Dialog.svelte';
  import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
  import FormInput from '#lib/components/ui/form/FormInput.svelte';
  import FormError from '#lib/components/ui/form/FormError.svelte';
  import { toast } from '#lib/state/toast.svelte.js';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let editingFlag: (typeof data.flags)[number] | null = $state(null);
  let editBody = $state('');
  let resolvingFlag: (typeof data.flags)[number] | null = $state(null);
  let isSubmitting = $state(false);
  let lastFormResult: ActionData = null;

  $effect(() => {
    if (form && form !== lastFormResult) {
      lastFormResult = form;
      if (form.success && form.message) {
        toast.success(form.message);
      } else if (form.error) {
        toast.error(form.error);
      }
    }
  });

  const openFlags = $derived(data.flags.filter((f) => !f.resolvedAt));
  const resolvedFlags = $derived(data.flags.filter((f) => f.resolvedAt));

  function fmtDate(value: string | Date | null) {
    if (!value) return '—';
    return new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="mx-auto max-w-7xl space-y-4 sm:space-y-6">
  <div>
    <h1 class="text-3xl font-bold text-text-heading mb-2">Player Flags</h1>
    <p class="text-text-body">
      Mod-only staff notes on players (suspicious behaviour, demo requests, strikes). Never visible
      to players — every add, edit and resolve is written to the audit log.
    </p>
  </div>

  <Card padding="sm">
    <h2 class="text-sm font-semibold text-text-heading mb-3">Add flag</h2>
    <form
      method="POST"
      action="?/createFlag"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update }) => {
          await update();
          isSubmitting = false;
        };
      }}
      class="grid gap-3 sm:grid-cols-[240px_minmax(0,1fr)_auto] sm:items-end"
    >
      <FormInput label="Player Steam ID" name="playerSteamId" required placeholder="7656119..." />
      <div>
        <label for="flag-body" class="block text-sm font-medium text-text-label mb-2">Note</label>
        <textarea
          id="flag-body"
          name="body"
          rows="2"
          required
          maxlength="5000"
          placeholder="e.g. suspicious, needs to submit demo, 1st strike"
          class="w-full px-3 py-2 bg-surface-input border border-border-input rounded-lg text-text-heading text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
        ></textarea>
      </div>
      <Button type="submit" variant="primary" disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add Flag'}
      </Button>
    </form>
    <FormError error={form?.error} />
  </Card>

  <Card padding="sm">
    <h2 class="text-sm font-semibold text-text-heading mb-3">
      Open flags ({openFlags.length})
    </h2>
    {#if openFlags.length === 0}
      <p class="text-sm text-text-muted">No open flags.</p>
    {:else}
      <div class="divide-y divide-border-default">
        {#each openFlags as flag (flag.id)}
          <div class="py-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <a
                  href="/users/{flag.playerSteamId}"
                  class="text-sm font-medium text-primary-ink hover:text-primary-300"
                >
                  {flag.player?.steamUsername ?? flag.playerSteamId}
                </a>
                <Badge color="red">Open</Badge>
              </div>
              <p class="mt-1 text-sm text-text-body whitespace-pre-wrap">{flag.body}</p>
              <p class="mt-1 text-xs text-text-muted">
                by {flag.creator?.steamUsername ?? flag.createdBy ?? 'unknown'} ·
                {fmtDate(flag.createdAt)}
                {#if flag.updatedAt !== flag.createdAt}· edited {fmtDate(flag.updatedAt)}{/if}
              </p>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onclick={() => {
                  editingFlag = flag;
                  editBody = flag.body;
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                title="Mark this flag resolved. History is kept."
                onclick={() => (resolvingFlag = flag)}
              >
                Resolve
              </Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card padding="sm">
    <h2 class="text-sm font-semibold text-text-heading mb-3">
      Resolved flags ({resolvedFlags.length})
    </h2>
    {#if resolvedFlags.length === 0}
      <p class="text-sm text-text-muted">No resolved flags.</p>
    {:else}
      <div class="divide-y divide-border-default">
        {#each resolvedFlags as flag (flag.id)}
          <div class="py-3">
            <div class="flex flex-wrap items-center gap-2">
              <a
                href="/users/{flag.playerSteamId}"
                class="text-sm font-medium text-primary-ink hover:text-primary-300"
              >
                {flag.player?.steamUsername ?? flag.playerSteamId}
              </a>
              <Badge color="zinc">Resolved</Badge>
            </div>
            <p class="mt-1 text-sm text-text-muted whitespace-pre-wrap">{flag.body}</p>
            <p class="mt-1 text-xs text-text-muted">
              resolved by {flag.resolver?.steamUsername ?? flag.resolvedBy ?? 'unknown'} ·
              {fmtDate(flag.resolvedAt)}
            </p>
          </div>
        {/each}
      </div>
    {/if}
  </Card>

  <Card padding="sm">
    <h2 class="text-sm font-semibold text-text-heading mb-3">Flag history (audit log)</h2>
    {#if data.history.length === 0}
      <p class="text-sm text-text-muted">No flag activity yet.</p>
    {:else}
      <div class="divide-y divide-border-default">
        {#each data.history as entry (entry.id)}
          <div class="py-2 text-sm">
            <span class="font-medium text-text-heading"
              >{entry.action.replace('USER_FLAG_', '')}</span
            >
            <span class="text-text-body">
              {entry.targetUser?.steamUsername ?? entry.targetId}
              by {entry.actor?.steamUsername ?? entry.actorId ?? 'unknown'}
            </span>
            <span class="text-text-muted"> · {fmtDate(entry.timestamp)}</span>
            {#if entry.metadata && (entry.metadata as Record<string, unknown>).body}
              <p class="mt-0.5 truncate text-xs text-text-muted">
                {(entry.metadata as Record<string, unknown>).body as string}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Card>
</div>

{#if editingFlag}
  <Dialog open={true} title="Edit flag" onClose={() => (editingFlag = null)}>
    <FormError error={form?.error} />
    <form
      method="POST"
      action="?/updateFlag"
      use:enhance={() => {
        isSubmitting = true;
        return async ({ update, result }) => {
          await update();
          isSubmitting = false;
          if (result.type === 'success') editingFlag = null;
        };
      }}
    >
      <input type="hidden" name="flagId" value={editingFlag.id} />
      <div class="mb-4">
        <label for="flag-edit-body" class="mb-2 block text-sm font-medium text-text-label">
          Note for {editingFlag.player?.steamUsername ?? editingFlag.playerSteamId}
        </label>
        <textarea
          id="flag-edit-body"
          name="body"
          rows="4"
          required
          maxlength="5000"
          bind:value={editBody}
          class="w-full resize-none rounded-lg border border-border-input bg-surface-input px-4 py-3 text-text-heading placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
        ></textarea>
      </div>
      <div class="flex justify-end gap-3">
        <Button type="button" variant="secondary" onclick={() => (editingFlag = null)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  </Dialog>
{/if}

<ConfirmDialog
  open={resolvingFlag !== null}
  title="Resolve flag for {resolvingFlag?.player?.steamUsername ?? ''}?"
  description="The flag stays in history as resolved."
  variant="info"
  confirmLabel="Resolve"
  isLoading={isSubmitting}
  onConfirm={() => {
    const f = document.getElementById('form-resolve-flag') as HTMLFormElement | null;
    f?.requestSubmit();
  }}
  onCancel={() => (resolvingFlag = null)}
/>

<form
  id="form-resolve-flag"
  method="POST"
  action="?/resolveFlag"
  class="hidden"
  use:enhance={() => {
    isSubmitting = true;
    return async ({ update, result }) => {
      await update();
      isSubmitting = false;
      resolvingFlag = null;
      if (result.type === 'failure') {
        const d = 'data' in result ? (result.data as { error?: string } | undefined) : undefined;
        toast.error(d?.error || 'Failed to resolve flag');
      }
    };
  }}
>
  <input type="hidden" name="flagId" value={resolvingFlag?.id ?? ''} />
</form>
