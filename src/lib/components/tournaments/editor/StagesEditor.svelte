<script lang="ts">
  import type {
    BracketFormat,
    DraftEliminationMatch,
    DraftStage,
    EventDraftPayload,
  } from '$lib/types/tournament-editor';
  import { nextDraftId } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';
  import MatchesEditor from './MatchesEditor.svelte';

  type Arena = { id: number; name: string };

  let {
    draft = $bindable(),
    arenas,
  }: {
    draft: EventDraftPayload;
    arenas: Arena[];
  } = $props();

  const formatOptions = [
    { value: 'SINGLE_ELIM', label: 'Single elimination' },
    { value: 'DOUBLE_ELIM', label: 'Double elimination' },
    { value: 'ROUND_ROBIN', label: 'Round robin' },
    { value: 'CARD', label: 'Fight card' },
  ];

  function addStage() {
    draft.stages.push({
      id: nextDraftId('stage'),
      name: `Stage ${draft.stages.length + 1}`,
      orderNum: draft.stages.length,
      bracketFormat: 'SINGLE_ELIM',
      matches: [],
    });
  }

  function removeStage(id: string) {
    draft.stages = draft.stages
      .filter((stage) => stage.id !== id)
      .map((stage, index) => ({ ...stage, orderNum: index }));
  }

  function moveStage(id: string, direction: -1 | 1) {
    const index = draft.stages.findIndex((stage) => stage.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= draft.stages.length) return;
    const reordered = [...draft.stages];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    draft.stages = reordered.map((stage, stageIndex) => ({
      ...stage,
      orderNum: stageIndex,
    }));
  }

  function changeFormat(index: number, format: BracketFormat) {
    const current = draft.stages[index];
    if (!current || current.bracketFormat === format) return;

    if (format === 'SINGLE_ELIM' || format === 'DOUBLE_ELIM') {
      const matches: DraftEliminationMatch[] = current.matches.map((match) => ({
        ...match,
        section: format === 'DOUBLE_ELIM' ? 'WINNERS' : 'MAIN',
        winnerNextMatchId: 'winnerNextMatchId' in match ? match.winnerNextMatchId : null,
        winnerNextSide: 'winnerNextSide' in match ? match.winnerNextSide : null,
        loserNextMatchId: 'loserNextMatchId' in match ? match.loserNextMatchId : null,
        loserNextSide: 'loserNextSide' in match ? match.loserNextSide : null,
      }));
      draft.stages[index] = { ...current, bracketFormat: format, matches };
      return;
    }

    const matches = current.matches.map((match) => ({
      id: match.id,
      orderNum: match.orderNum,
      round: format === 'CARD' ? null : (match.round ?? 1),
      label: match.label,
      boSeries: match.boSeries,
      status: match.status,
      winnerSide: match.winnerSide,
      side1Score: match.side1Score,
      side2Score: match.side2Score,
      players: match.players,
      games: match.games,
    }));
    draft.stages[index] = { ...current, bracketFormat: format, matches };
  }

  function handleKeydown(event: KeyboardEvent, stageId: string) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveStage(stageId, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveStage(stageId, 1);
    }
  }
</script>

<Card>
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold text-white">Stages and matches</h2>
      <p class="mt-1 text-sm text-text-muted">
        Use Alt+Arrow Up or Alt+Arrow Down to reorder a focused stage.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <Badge color="zinc">{draft.stages.length}</Badge>
      <Button type="button" variant="primary" size="sm" onclick={addStage}>Add stage</Button>
    </div>
  </div>

  {#if draft.stages.length === 0}
    <p class="rounded-lg border border-border-default bg-surface-input p-4 text-sm text-text-muted">
      Add a stage to begin building the bracket.
    </p>
  {:else}
    <div class="space-y-5">
      {#each draft.stages as stage, index (stage.id)}
        <Card padding="sm">
          <div>
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold text-white">{stage.name || `Stage ${index + 1}`}</h3>
                <p class="text-xs text-text-muted">Order {stage.orderNum}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  aria-label="Move {stage.name || `stage ${index + 1}`} up"
                  onclick={() => moveStage(stage.id, -1)}
                  onkeydown={(event: KeyboardEvent) => handleKeydown(event, stage.id)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === draft.stages.length - 1}
                  aria-label="Move {stage.name || `stage ${index + 1}`} down"
                  onclick={() => moveStage(stage.id, 1)}
                  onkeydown={(event: KeyboardEvent) => handleKeydown(event, stage.id)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  aria-label="Remove {stage.name || `stage ${index + 1}`}"
                  onclick={() => removeStage(stage.id)}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div class="grid gap-x-4 md:grid-cols-2">
              <FormInput
                label="Stage name"
                name="stage-name-{stage.id}"
                bind:value={stage.name}
                required
              />
              <FormSelect
                label="Bracket format"
                name="stage-format-{stage.id}"
                value={stage.bracketFormat}
                options={formatOptions}
                required
                onChange={(value) => changeFormat(index, value as BracketFormat)}
              />
            </div>

            <MatchesEditor {stage} participants={draft.participants} {arenas} />
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</Card>
