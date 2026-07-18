import { describe, expect, it } from 'vitest';
import {
  buildDoubleElimBracket,
  buildRoundRobinBracket,
  buildSingleElimBracket,
  type BracketMatchInput,
} from '$lib/server/utils/bracketBuilders';

function match(
  input: Partial<BracketMatchInput> & Pick<BracketMatchInput, 'id' | 'round' | 'orderNum'>,
): BracketMatchInput {
  return {
    label: null,
    winnerSide: null,
    side1Score: null,
    side2Score: null,
    boSeries: 3,
    status: 'UNPLAYED',
    players: [],
    ...input,
  };
}

describe('bracket presentation builders', () => {
  it('distinguishes an empty TBD slot from an explicit BYE', () => {
    const data = buildSingleElimBracket(
      {
        name: 'Bracket',
        matches: [
          match({ id: 'tbd', round: 1, orderNum: 1 }),
          match({
            id: 'bye',
            round: 1,
            orderNum: 2,
            players: [
              { side: 1, displayName: 'Alpha', steamId: 'alpha' },
              { side: 2, displayName: 'BYE' },
            ],
          }),
        ],
      },
      'upcoming',
    );

    expect(data.format).toBe('single_elim');
    if (data.format !== 'single_elim') throw new Error('Unexpected format');
    expect(data.rounds[0].matches[0].side1.label).toBe('TBD');
    expect(data.rounds[0].matches[1].side2.label).toBe('BYE');
  });

  it('calculates round-robin standings from played matches', () => {
    const data = buildRoundRobinBracket(
      {
        name: 'Group A',
        matches: [
          match({
            id: 1,
            round: 1,
            orderNum: 1,
            status: 'PLAYED',
            winnerSide: 1,
            side1Score: 2,
            side2Score: 0,
            players: [
              { side: 1, displayName: 'Alpha', steamId: 'alpha' },
              { side: 2, displayName: 'Beta', steamId: 'beta' },
            ],
          }),
        ],
      },
      'completed',
    );

    expect(data.format).toBe('round_robin');
    if (data.format !== 'round_robin') throw new Error('Unexpected format');
    expect(data.standings[0]).toMatchObject({
      steamId: 'alpha',
      wins: 1,
      points: 3,
      gamesWon: 2,
    });
    expect(data.standings[1]).toMatchObject({
      steamId: 'beta',
      losses: 1,
      points: 0,
      gamesLost: 2,
    });
  });

  it('keeps losers drop-ins and grand-final reset matches in explicit sections', () => {
    const data = buildDoubleElimBracket(
      {
        name: 'Top 8',
        matches: [
          match({ id: 'w1', round: 1, orderNum: 1, section: 'WINNERS' }),
          match({ id: 'l1', round: 1, orderNum: 2, section: 'LOSERS' }),
          match({ id: 'gf', round: 0, orderNum: 3, section: 'GRAND_FINAL' }),
          match({ id: 'reset', round: 0, orderNum: 4, section: 'GRAND_FINAL' }),
        ],
      },
      'completed',
    );

    expect(data.format).toBe('double_elim');
    if (data.format !== 'double_elim') throw new Error('Unexpected format');
    expect(data.rounds[0].matches.map((entry) => entry.id)).toEqual(['w1']);
    expect(data.loserRounds?.[0].matches.map((entry) => entry.id)).toEqual(['l1']);
    expect(data.grandFinal?.matches.map((entry) => entry.id)).toEqual(['gf', 'reset']);
  });
});
