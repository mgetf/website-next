<script lang="ts">
  import type { ActionData, PageData } from './$types';
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import { createEmptyDraftPayload } from '$lib/types/tournament-editor';
  import { hasBlockingErrors, validateDraftStructure } from '$lib/utils/tournamentDraftValidation';
  import BasicsEditor from '$lib/components/tournaments/editor/BasicsEditor.svelte';
  import BracketPreview from '$lib/components/tournaments/editor/BracketPreview.svelte';
  import ParticipantsEditor from '$lib/components/tournaments/editor/ParticipantsEditor.svelte';
  import PlacementsEditor from '$lib/components/tournaments/editor/PlacementsEditor.svelte';
  import PublishControls from '$lib/components/tournaments/editor/PublishControls.svelte';
  import StagesEditor from '$lib/components/tournaments/editor/StagesEditor.svelte';
  import ValidationSummary from '$lib/components/tournaments/editor/ValidationSummary.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import FormError from '$lib/components/ui/form/FormError.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  class EditorState {
    draft = $state<EventDraftPayload>(createEmptyDraftPayload());
    revision = $state(1);

    constructor(payload: EventDraftPayload, revision: number) {
      this.draft = structuredClone(payload);
      this.revision = revision;
    }
  }

  const editor = $derived(new EditorState(data.draft.payload, data.draft.revision));
  const issues = $derived(validateDraftStructure(editor.draft));
  const blocking = $derived(hasBlockingErrors(issues));
</script>

<svelte:head>
  <title>{editor.draft.name || 'Tournament Draft'} - Admin - MGE.tf</title>
</svelte:head>

<div class="mx-auto max-w-[110rem] space-y-6">
  <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <Button href="/admin/tournaments" variant="ghost" size="sm">← Tournament editor</Button>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <h1 class="text-3xl font-bold text-white">
          {editor.draft.name || 'Untitled tournament'}
        </h1>
        <Badge color={data.draft.eventId ? 'green' : 'yellow'}>
          {data.draft.eventId ? 'Published tournament' : 'Draft only'}
        </Badge>
        <Badge color="orange">Revision {editor.revision}</Badge>
      </div>
      <p class="mt-2 text-sm text-text-muted">
        Draft {data.draft.draftId}
        {#if data.draft.eventId}
          · Event {data.draft.eventId}
        {/if}
      </p>
    </div>
  </header>

  <FormError error={form?.error} success={form?.success && form?.message ? form.message : null} />

  <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(24rem,2fr)]">
    <div class="space-y-6">
      <BasicsEditor bind:draft={editor.draft} />
      <ParticipantsEditor bind:draft={editor.draft} users={data.users} />
      <StagesEditor bind:draft={editor.draft} arenas={data.arenas} />
      <PlacementsEditor bind:draft={editor.draft} />
    </div>

    <aside class="space-y-6">
      <BracketPreview draft={editor.draft} />
      <ValidationSummary {issues} />
      <PublishControls
        payload={editor.draft}
        bind:revision={editor.revision}
        revisions={data.revisions}
        {blocking}
        publishedRevision={data.publishedRevision}
        onSaved={() => undefined}
      />
    </aside>
  </div>
</div>
