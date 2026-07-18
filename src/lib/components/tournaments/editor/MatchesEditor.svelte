<script lang="ts">
  import type {
    DraftCardStage,
    DraftEliminationMatch,
    DraftGame,
    DraftMatchBase,
    DraftRoundRobinStage,
    DraftStage,
    EventDraftPayload,
    MatchSide,
  } from '$lib/types/tournament-editor';
  import { nextDraftId } from '$lib/types/tournament-editor';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import FormInput from '$lib/components/ui/form/FormInput.svelte';
  import FormSelect from '$lib/components/ui/form/FormSelect.svelte';

  type Arena = { id: number; name: string };

  let {
    stage = $bindable(),
    participants,
    arenas,
  }: {
    stage: DraftStage;
    participants: EventDraftPayload['participants'];
    arenas: Arena[];
  } = $props();

  const participantOptions = $derived(
    participants.map((participant) => ({
      value: participant.steamId,
      label: participant.displayName,
    })),
  );

  const arenaOptions = $derived(
    arenas.map((arena) => ({ value: String(arena.id), label: arena.name })),
  );

  const statusOptions = [
    { value: 'UNPLAYED', label: 'Unplayed' },
    { value: 'PLAYED', label: 'Played' },
    { value: 'DISPUTE', label: 'Dispute' },
  ];

  const winnerOptions = [
    { value: '1', label: 'Side 1' },
    { value: '2', label: 'Side 2' },
  ];

  const sectionOptions = [
    { value: 'MAIN', label: 'Main bracket' },
    { value: 'WINNERS', label: 'Winners bracket' },
    { value: 'LOSERS', label: 'Losers bracket' },
    { value: 'GRAND_FINAL', label: 'Grand final' },
  ];

  function baseMatch(): DraftMatchBase {
    return {
      id: nextDraftId('match'),
      orderNum: stage.matches.length,
      round: stage.bracketFormat === 'CARD' ? null : 1,
      label: null,
      boSeries: 1,
      status: 'UNPLAYED',
      winnerSide: null,
      side1Score: null,
      side2Score: null,
      players: [],
      games: [],
    };
  }

  function addMatch() {
    const base = baseMatch();
    if (stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM') {
      const match: DraftEliminationMatch = {
        ...base,
        section: stage.bracketFormat === 'DOUBLE_ELIM' ? 'WINNERS' : 'MAIN',
        winnerNextMatchId: null,
        winnerNextSide: null,
        loserNextMatchId: null,
        loserNextSide: null,
      };
      stage.matches.push(match);
    } else {
      const simpleStage = stage as DraftRoundRobinStage | DraftCardStage;
      simpleStage.matches.push(base);
    }
  }

  function removeMatch(id: string) {
    stage.matches = stage.matches
      .filter((match) => match.id !== id)
      .map((match, index) => ({ ...match, orderNum: index }));
    if (stage.bracketFormat === 'SINGLE_ELIM' || stage.bracketFormat === 'DOUBLE_ELIM') {
      for (const match of stage.matches) {
        if (match.winnerNextMatchId === id) {
          match.winnerNextMatchId = null;
          match.winnerNextSide = null;
        }
        if (match.loserNextMatchId === id) {
          match.loserNextMatchId = null;
          match.loserNextSide = null;
        }
      }
    }
  }

  function moveMatch(id: string, direction: -1 | 1) {
    const index = stage.matches.findIndex((match) => match.id === id);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= stage.matches.length) return;
    const reordered = [...stage.matches];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    stage.matches = reordered.map((match, matchIndex) => ({
      ...match,
      orderNum: matchIndex,
    }));
  }

  function sideSteamId(match: DraftMatchBase, side: MatchSide): string {
    return match.players.find((player) => player.side === side)?.steamId ?? '';
  }

  function isEliminationMatch(match: DraftMatchBase): match is DraftEliminationMatch {
    return 'section' in match;
  }

  function setSide(match: DraftMatchBase, side: MatchSide, steamId: string) {
    match.players = match.players.filter((player) => player.side !== side);
    if (!steamId) return;
    const participant = participants.find((candidate) => candidate.steamId === steamId);
    if (!participant) return;
    match.players.push({
      side,
      steamId: participant.steamId,
      displayName: participant.displayName,
    });
    match.players.sort((first, second) => first.side - second.side);
  }

  function swapSides(match: DraftMatchBase) {
    match.players = match.players.map((player) => ({
      ...player,
      side: player.side === 1 ? 2 : 1,
    }));
    [match.side1Score, match.side2Score] = [match.side2Score, match.side1Score];
    if (match.winnerSide !== null) match.winnerSide = match.winnerSide === 1 ? 2 : 1;
    match.games = match.games.map((game) => ({
      ...game,
      side1Score: game.side2Score,
      side2Score: game.side1Score,
    }));
  }

  function handleKeydown(event: KeyboardEvent, match: DraftMatchBase) {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveMatch(match.id, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveMatch(match.id, 1);
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      swapSides(match);
    }
  }

  function nullableText(value: string | null): string | null {
    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : null;
  }

  function nullableInteger(value: string | null): number | null {
    if (!value?.trim()) return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  function positiveInteger(value: string | null, fallback = 1): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  function addGame(match: DraftMatchBase) {
    const game: DraftGame = {
      id: nextDraftId('game'),
      gameNumber: match.games.length + 1,
      side1Score: null,
      side2Score: null,
      arenaId: null,
      playedAt: null,
    };
    match.games.push(game);
  }

  function removeGame(match: DraftMatchBase, gameId: string) {
    match.games = match.games
      .filter((game) => game.id !== gameId)
      .map((game, index) => ({ ...game, gameNumber: index + 1 }));
  }
</script>

<div class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 class="text-lg font-semibold text-white">Matches</h3>
      <p class="mt-1 text-xs text-text-muted">
        Focus a match and use Alt+Arrow keys to move it, or Alt+S to swap sides.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <Badge color="zinc">{stage.matches.length}</Badge>
      <Button type="button" size="sm" variant="primary" onclick={addMatch}>Add match</Button>
    </div>
  </div>

  {#if stage.matches.length === 0}
    <p class="text-sm text-text-muted">No matches in this stage.</p>
  {:else}
    {#each stage.matches as match, index (match.id)}
      <Card padding="sm">
        <div>
          <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="font-semibold text-white">{match.label || `Match ${index + 1}`}</p>
              <p class="text-xs text-text-muted">Order {match.orderNum}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === 0}
                aria-label="Move match {index + 1} up"
                onclick={() => moveMatch(match.id, -1)}
                onkeydown={(event: KeyboardEvent) => handleKeydown(event, match)}
              >
                ↑
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === stage.matches.length - 1}
                aria-label="Move match {index + 1} down"
                onclick={() => moveMatch(match.id, 1)}
                onkeydown={(event: KeyboardEvent) => handleKeydown(event, match)}
              >
                ↓
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Swap sides for match {index + 1}"
                onclick={() => swapSides(match)}
                onkeydown={(event: KeyboardEvent) => handleKeydown(event, match)}
              >
                Swap sides
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                aria-label="Remove match {index + 1}"
                onclick={() => removeMatch(match.id)}
              >
                Remove
              </Button>
            </div>
          </div>

          <div class="grid gap-x-4 md:grid-cols-2 xl:grid-cols-3">
            <FormInput
              label="Label"
              name="match-label-{match.id}"
              value={match.label}
              onInput={(value) => (match.label = nullableText(value))}
            />
            <FormInput
              label="Round"
              name="match-round-{match.id}"
              type="number"
              value={match.round === null ? '' : String(match.round)}
              onInput={(value) => (match.round = nullableInteger(value))}
            />
            <FormInput
              label="Best of"
              name="match-best-of-{match.id}"
              type="number"
              value={String(match.boSeries)}
              onInput={(value) => (match.boSeries = positiveInteger(value))}
            />
            <FormSelect
              label="Status"
              name="match-status-{match.id}"
              bind:value={match.status}
              options={statusOptions}
              required
            />
            <FormSelect
              label="Winner"
              name="match-winner-{match.id}"
              value={match.winnerSide === null ? '' : String(match.winnerSide)}
              options={winnerOptions}
              placeholder="No winner"
              onChange={(value) => (match.winnerSide = value ? (Number(value) as MatchSide) : null)}
            />
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <FormSelect
                label="Side 1"
                name="match-side-1-{match.id}"
                value={sideSteamId(match, 1)}
                options={participantOptions}
                placeholder="TBD"
                onChange={(value) => setSide(match, 1, value)}
              />
              <FormInput
                label="Side 1 score"
                name="match-side-1-score-{match.id}"
                type="number"
                value={match.side1Score === null ? '' : String(match.side1Score)}
                onInput={(value) => (match.side1Score = nullableInteger(value))}
              />
            </div>
            <div>
              <FormSelect
                label="Side 2"
                name="match-side-2-{match.id}"
                value={sideSteamId(match, 2)}
                options={participantOptions}
                placeholder="TBD"
                onChange={(value) => setSide(match, 2, value)}
              />
              <FormInput
                label="Side 2 score"
                name="match-side-2-score-{match.id}"
                type="number"
                value={match.side2Score === null ? '' : String(match.side2Score)}
                onInput={(value) => (match.side2Score = nullableInteger(value))}
              />
            </div>
          </div>

          {#if isEliminationMatch(match)}
            {@const destinationOptions = stage.matches
              .filter((candidate) => candidate.id !== match.id)
              .map((candidate) => ({
                value: candidate.id,
                label: candidate.label || `Match ${candidate.orderNum + 1}`,
              }))}
            <div class="mb-5 border-t border-border-default pt-5">
              <h4 class="mb-4 font-medium text-white">Elimination progression</h4>
              <div class="grid gap-x-4 md:grid-cols-2 xl:grid-cols-3">
                <FormSelect
                  label="Bracket section"
                  name="match-section-{match.id}"
                  bind:value={match.section}
                  options={sectionOptions}
                  required
                />
                <FormSelect
                  label="Winner advances to"
                  name="match-winner-next-{match.id}"
                  value={match.winnerNextMatchId ?? ''}
                  options={destinationOptions}
                  placeholder="No destination"
                  onChange={(value) => {
                    match.winnerNextMatchId = nullableText(value);
                    if (!value) match.winnerNextSide = null;
                  }}
                />
                <FormSelect
                  label="Winner target side"
                  name="match-winner-next-side-{match.id}"
                  value={match.winnerNextSide === null ? '' : String(match.winnerNextSide)}
                  options={winnerOptions}
                  placeholder="No side"
                  disabled={!match.winnerNextMatchId}
                  onChange={(value) =>
                    (match.winnerNextSide = value ? (Number(value) as MatchSide) : null)}
                />
                <FormSelect
                  label="Loser advances to"
                  name="match-loser-next-{match.id}"
                  value={match.loserNextMatchId ?? ''}
                  options={destinationOptions}
                  placeholder="Eliminated"
                  disabled={match.section === 'LOSERS'}
                  onChange={(value) => {
                    match.loserNextMatchId = nullableText(value);
                    if (!value) match.loserNextSide = null;
                  }}
                />
                <FormSelect
                  label="Loser target side"
                  name="match-loser-next-side-{match.id}"
                  value={match.loserNextSide === null ? '' : String(match.loserNextSide)}
                  options={winnerOptions}
                  placeholder="No side"
                  disabled={!match.loserNextMatchId || match.section === 'LOSERS'}
                  onChange={(value) =>
                    (match.loserNextSide = value ? (Number(value) as MatchSide) : null)}
                />
              </div>
            </div>
          {/if}

          <div class="border-t border-border-default pt-5">
            <div class="mb-4 flex items-center justify-between gap-3">
              <h4 class="font-medium text-white">Games</h4>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label="Add game to match {index + 1}"
                onclick={() => addGame(match)}
              >
                Add game
              </Button>
            </div>
            <div class="space-y-3">
              {#each match.games as game (game.id)}
                <div class="grid items-end gap-3 md:grid-cols-5">
                  <FormInput
                    label="Game"
                    name="game-number-{game.id}"
                    type="number"
                    value={String(game.gameNumber)}
                    onInput={(value) => (game.gameNumber = positiveInteger(value))}
                  />
                  <FormInput
                    label="Side 1"
                    name="game-side-1-{game.id}"
                    type="number"
                    value={game.side1Score === null ? '' : String(game.side1Score)}
                    onInput={(value) => (game.side1Score = nullableInteger(value))}
                  />
                  <FormInput
                    label="Side 2"
                    name="game-side-2-{game.id}"
                    type="number"
                    value={game.side2Score === null ? '' : String(game.side2Score)}
                    onInput={(value) => (game.side2Score = nullableInteger(value))}
                  />
                  <FormSelect
                    label="Arena"
                    name="game-arena-{game.id}"
                    value={game.arenaId === null ? '' : String(game.arenaId)}
                    options={arenaOptions}
                    placeholder="No arena"
                    onChange={(value) => (game.arenaId = value ? Number(value) : null)}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    class="mb-6"
                    aria-label="Remove game {game.gameNumber}"
                    onclick={() => removeGame(match, game.id)}
                  >
                    Remove
                  </Button>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </Card>
    {/each}
  {/if}
</div>
