import { describe, expect, it } from 'vitest';
import { findEventInvariantFindings, type EventInvariantStage } from '$lib/utils/eventInvariants';

function stage(overrides: Partial<EventInvariantStage> = {}): EventInvariantStage {
  return {
    id: 1,
    name: 'Main Bracket',
    bracketFormat: 'SINGLE_ELIM',
    event: { id: 1, name: 'Cup' },
    matches: [],
    ...overrides,
  };
}

describe('published event invariant audit', () => {
  it('reports empty stages', () => {
    const findings = findEventInvariantFindings([stage()]);
    expect(findings).toEqual([
      expect.objectContaining({
        code: 'EMPTY_STAGE',
        stageId: 1,
      }),
    ]);
  });

  it('reports malformed elimination topology', () => {
    const findings = findEventInvariantFindings([
      stage({
        matches: [
          {
            id: 10,
            round: null,
            orderNum: 1,
            label: null,
            status: 'PLAYED',
            winnerSide: null,
            section: null,
            winnerNextMatchId: null,
          },
        ],
      }),
    ]);

    expect(findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        'NULL_ELIMINATION_ROUND',
        'MISSING_BRACKET_SECTION',
        'INCOMPLETE_PLAYED_RESULT',
      ]),
    );
  });

  it('uses labels to separate historical winners and losers positions', () => {
    const findings = findEventInvariantFindings([
      stage({
        bracketFormat: 'DOUBLE_ELIM',
        matches: [
          {
            id: 1,
            round: 1,
            orderNum: 1,
            label: 'Winners Round 1',
            status: 'UNPLAYED',
            winnerSide: null,
            section: null,
            winnerNextMatchId: 3,
          },
          {
            id: 2,
            round: 1,
            orderNum: 1,
            label: 'Losers Round 1',
            status: 'UNPLAYED',
            winnerSide: null,
            section: null,
            winnerNextMatchId: 3,
          },
        ],
      }),
    ]);

    expect(findings.some((finding) => finding.code === 'DUPLICATE_MATCH_ORDER')).toBe(false);
  });
});
