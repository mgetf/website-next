import { describe, expect, it } from 'vitest';
import type { EventDraftPayload } from '$lib/types/tournament-editor';
import {
  hasBlockingErrors,
  isStaleDraftRevision,
  validateDraftStructure,
} from './tournamentDraftValidation';

function draft(overrides: Partial<EventDraftPayload> = {}): EventDraftPayload {
  return {
    name: 'Test Event',
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
        steamId: '76561198000000001',
        displayName: 'Alice',
        seed: 1,
        eliminated: false,
        hidden: false,
      },
      {
        id: 'p2',
        steamId: '76561198000000002',
        displayName: 'Bob',
        seed: 2,
        eliminated: false,
        hidden: false,
      },
    ],
    stages: [
      {
        id: 's1',
        name: 'Main',
        orderNum: 1,
        bracketFormat: 'SINGLE_ELIM',
        matches: [
          {
            id: 'm1',
            orderNum: 1,
            round: 1,
            label: null,
            boSeries: 1,
            status: 'UNPLAYED',
            winnerSide: null,
            side1Score: null,
            side2Score: null,
            section: 'MAIN',
            winnerNextMatchId: null,
            winnerNextSide: null,
            loserNextMatchId: null,
            loserNextSide: null,
            players: [
              { side: 1, participantId: 'p1', steamId: null, displayName: 'Alice' },
              { side: 2, participantId: 'p2', steamId: null, displayName: 'Bob' },
            ],
            games: [],
          },
        ],
      },
    ],
    placements: [],
    ...overrides,
  };
}

describe('validateDraftStructure', () => {
  it('accepts a minimal valid draft', () => {
    const issues = validateDraftStructure(draft());
    expect(hasBlockingErrors(issues)).toBe(false);
  });

  it('requires an event name', () => {
    const issues = validateDraftStructure(draft({ name: '   ' }));
    expect(issues.some((i) => i.path === 'name' && i.severity === 'error')).toBe(true);
  });

  it('rejects duplicate participant steam IDs and names', () => {
    const issues = validateDraftStructure(
      draft({
        participants: [
          {
            id: 'p1',
            steamId: '76561198000000001',
            displayName: 'Alice',
            seed: 1,
            eliminated: false,
            hidden: false,
          },
          {
            id: 'p2',
            steamId: '76561198000000001',
            displayName: 'alice',
            seed: 2,
            eliminated: false,
            hidden: false,
          },
        ],
      }),
    );

    expect(
      issues.filter((i) => i.path === 'participants' && i.severity === 'error').length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('revision helpers', () => {
  it('detects stale revisions and blocking errors', () => {
    expect(isStaleDraftRevision(2, 1)).toBe(true);
    expect(isStaleDraftRevision(2, 2)).toBe(false);
    expect(hasBlockingErrors([{ path: 'x', message: 'warn', severity: 'warning' }])).toBe(false);
    expect(hasBlockingErrors([{ path: 'x', message: 'err', severity: 'error' }])).toBe(true);
  });
});
