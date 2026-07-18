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

  const editorTabs = [
    {
      id: 'event-details',
      label: 'Event details',
      tabId: 'tournament-editor-tab-event-details',
      panelId: 'tournament-editor-panel-event-details',
    },
    {
      id: 'participants',
      label: 'Participants',
      tabId: 'tournament-editor-tab-participants',
      panelId: 'tournament-editor-panel-participants',
    },
    {
      id: 'stages-matches',
      label: 'Stages & matches',
      tabId: 'tournament-editor-tab-stages-matches',
      panelId: 'tournament-editor-panel-stages-matches',
    },
  ] as const;

  type EditorTab = (typeof editorTabs)[number];
  type EditorTabId = EditorTab['id'];

  const editor = $derived(new EditorState(data.draft.payload, data.draft.revision));
  const issues = $derived(validateDraftStructure(editor.draft));
  const blocking = $derived(hasBlockingErrors(issues));

  let activeTab = $state<EditorTabId>('event-details');

  function selectTab(tab: EditorTab, focusTab = false) {
    activeTab = tab.id;
    if (focusTab) {
      requestAnimationFrame(() => document.getElementById(tab.tabId)?.focus());
    }
  }

  function onTabKeydown(event: KeyboardEvent, index: number) {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % editorTabs.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + editorTabs.length) % editorTabs.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = editorTabs.length - 1;
    if (nextIndex === undefined) return;

    const nextTab = editorTabs[nextIndex];
    if (!nextTab) return;

    event.preventDefault();
    selectTab(nextTab, true);
  }
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
      <div class="border-b border-border-default pb-3">
        <div
          class="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Tournament editor sections"
          aria-orientation="horizontal"
        >
          {#each editorTabs as tab, index (tab.id)}
            <Button
              id={tab.tabId}
              type="button"
              role="tab"
              variant={activeTab === tab.id ? 'secondary' : 'ghost'}
              aria-selected={activeTab === tab.id}
              aria-controls={tab.panelId}
              tabindex={activeTab === tab.id ? 0 : -1}
              onclick={() => selectTab(tab)}
              onkeydown={(event: KeyboardEvent) => onTabKeydown(event, index)}
            >
              {tab.label}
            </Button>
          {/each}
        </div>
      </div>

      <div
        id={editorTabs[0].panelId}
        role="tabpanel"
        aria-labelledby={editorTabs[0].tabId}
        tabindex="0"
        hidden={activeTab !== editorTabs[0].id}
      >
        <BasicsEditor bind:draft={editor.draft} />
      </div>

      <div
        id={editorTabs[1].panelId}
        role="tabpanel"
        aria-labelledby={editorTabs[1].tabId}
        tabindex="0"
        hidden={activeTab !== editorTabs[1].id}
        class="space-y-6"
      >
        <ParticipantsEditor bind:draft={editor.draft} />
        <PlacementsEditor bind:draft={editor.draft} />
      </div>

      <div
        id={editorTabs[2].panelId}
        role="tabpanel"
        aria-labelledby={editorTabs[2].tabId}
        tabindex="0"
        hidden={activeTab !== editorTabs[2].id}
      >
        <StagesEditor bind:draft={editor.draft} arenas={data.arenas} />
      </div>
    </div>

    <aside
      class="space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto"
    >
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
