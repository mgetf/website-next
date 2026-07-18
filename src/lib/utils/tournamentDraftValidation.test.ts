import { describe, expect, it } from 'vitest';
import type { DraftEliminationMatch, EventDraftPayload } from '$lib/types/tournament-editor';
import {
  hasBlockingErrors,
  isStaleDraftRevision,
  validateDraftStructure,
} from '$lib/utils/tournamentDraftValidation';

function match(
  id: string,
  round: number,
  orderNum: number,
  winnerNextMatchId: string | null = null,
): DraftEliminationMatch {
  return {
    id,
    round,
    orderNum,
    label: null,
    boSeries: 3,
    status: 'UNPLAYED',
    winnerSide: null,
    side1Score: null,
    side2Score: null,
    players: [],
    games: [],
    section: 'MAIN',
    winnerNextMatchId,
    winnerNextSide: winnerNextMatchId ? 1 : null,
    loserNextMatchId: null,
    loserNextSide: null,
  };
}

function payload(matches: DraftEliminationMatch[]): EventDraftPayload {
  return {
    name: 'Test Cup',
    type: 'CUP',
    status: 'UPCOMING',
    isTeamEvent: false,
    description: null,
    avatar: null,
    startedAt: null,
    endedAt: null,
    prizepool: 0,
    card: null,
    bracketLink: null,
    participants: [
      {
        id: 'p1',
        steamId: 'steam-1',
        displayName: 'Alpha',
        seed: 1,
        eliminated: false,
        hidden: false,
      },
    ],
    placements: [{ id: 'place-1', steamId: 'steam-1', placement: 1 }],
    stages: [
      {
        id: 'stage-1',
        name: 'Top 4',
        orderNum: 1,
        bracketFormat: 'SINGLE_ELIM',
        matches,
      },
    ],
  };
}

describe('validateDraftStructure', () => {
  it('accepts an acyclic single-elimination topology', () => {
    const secondSemi = match('semi-2', 1, 2, 'final');
    secondSemi.winnerNextSide = 2;
    const issues = validateDraftStructure(
      payload([match('semi-1', 1, 1, 'final'), secondSemi, match('final', 2, 3)]),
    );

    expect(hasBlockingErrors(issues)).toBe(false);
  });

  it('rejects duplicate match order numbers', () => {
    const issues = validateDraftStructure(payload([match('a', 1, 1), match('b', 1, 1)]));

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'stages[0].matches',
          message: expect.stringContaining('Duplicate match position MAIN:1:1'),
          severity: 'error',
        }),
      ]),
    );
  });

  it('rejects progression cycles across winner and loser edges', () => {
    const first = match('first', 1, 1, 'second');
    const second = match('second', 2, 2, null);
    second.loserNextMatchId = 'first';
    second.loserNextSide = 2;

    const issues = validateDraftStructure(payload([first, second]));

    expect(issues.some((issue) => issue.message.includes('Progression cycle'))).toBe(true);
  });

  it('rejects a placement for a missing participant', () => {
    const draft = payload([match('final', 1, 1)]);
    draft.placements[0].steamId = 'missing';

    const issues = validateDraftStructure(draft);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'placements[0].steamId',
          severity: 'error',
        }),
      ]),
    );
  });
});

describe('draft revision conflicts', () => {
  it('detects an optimistic-lock conflict', () => {
    expect(isStaleDraftRevision(4, 3)).toBe(true);
    expect(isStaleDraftRevision(4, 4)).toBe(false);
  });
});
