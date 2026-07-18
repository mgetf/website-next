<script lang="ts">
  import type { EventDraftPayload } from '$lib/types/tournament-editor';
  import { previewDraftStage } from '$lib/utils/tournamentPreview';
  import BracketRenderer from '$lib/components/brackets/BracketRenderer.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { draft }: { draft: EventDraftPayload } = $props();

  let selectedStageId = $state('');
  const selectedStage = $derived(
    draft.stages.find((stage) => stage.id === selectedStageId) ?? draft.stages[0],
  );
  const preview = $derived(selectedStage ? previewDraftStage(selectedStage, draft.status) : null);
</script>

<Card class="lg:sticky lg:top-6">
  <div class="mb-4">
    <h2 class="text-xl font-semibold text-white">Live bracket preview</h2>
    <p class="mt-1 text-sm text-text-muted">Changes appear here before the draft is saved.</p>
  </div>

  {#if draft.stages.length === 0}
    <div class="rounded-lg border border-border-default bg-surface-input p-6 text-center">
      <p class="text-sm text-text-muted">Add a stage to preview its bracket.</p>
    </div>
  {:else}
    <div class="mb-5 flex flex-wrap gap-2" aria-label="Preview stage">
      {#each draft.stages as stage (stage.id)}
        <Button
          type="button"
          size="sm"
          variant={selectedStage?.id === stage.id ? 'primary' : 'ghost'}
          aria-pressed={selectedStage?.id === stage.id}
          onclick={() => (selectedStageId = stage.id)}
        >
          {stage.name || 'Untitled stage'}
        </Button>
      {/each}
    </div>

    {#if preview}
      <div class="min-h-48 overflow-x-auto">
        <BracketRenderer data={preview} />
      </div>
    {/if}
  {/if}
</Card>
