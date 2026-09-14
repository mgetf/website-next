import { describe, expect, it } from 'vitest';
import { buildSingleElimBracket, type BracketMatchInput } from './bracketBuilders';

function input(
  partial: Partial<BracketMatchInput> & Pick<BracketMatchInput, 'id' | 'round'>,
): BracketMatchInput {
  return {
    orderNum: Number(partial.id),
    label: null,
    winnerSide: null,
    side1Score: null,
    side2Score: null,
    boSeries: 3,
    status: 'UNPLAYED',
    players: [],
    ...partial,
  };
}

function expectUniqueIds(rounds: { matches: { id: number | string }[] }[]) {
  for (const round of rounds) {
    const ids = round.matches.map((match) => String(match.id));
    expect(new Set(ids).size).toBe(ids.length);
  }
}

describe('buildSingleElimBracket bye padding', () => {
  it('does not reuse a match id when later rounds are TBD vs TBD', () => {
    const bracket = buildSingleElimBracket(
      {
        name: 'league-like',
        matches: [
          input({
            id: 3562,
            round: 1,
            status: 'PLAYED',
            winnerSide: 1,
            side1Score: 2,
            side2Score: 0,
          }),
          input({
            id: 3563,
            round: 1,
            status: 'PLAYED',
            winnerSide: 1,
            side1Score: 2,
            side2Score: 0,
            players: [
              { displayName: 'Alice', side: 1 },
              { displayName: 'Bob', side: 2 },
            ],
          }),
          input({ id: 4000, round: 2 }),
          input({ id: 4001, round: 2 }),
        ],
      },
      'in_progress',
    );

    expectUniqueIds(bracket.rounds);
    expect(bracket.rounds[0]?.matches.some((match) => match.id === 3562)).toBe(true);
    expect(bracket.rounds[0]?.matches.some((match) => match.id === 3563)).toBe(true);
  });

  it('pads a short first round with byes without duplicating match ids', () => {
    const bracket = buildSingleElimBracket(
      {
        name: 'byes',
        matches: [
          input({
            id: 1,
            round: 1,
            status: 'PLAYED',
            winnerSide: 1,
            side1Score: 2,
            side2Score: 0,
            players: [
              { displayName: 'Alice', side: 1 },
              { displayName: 'Bob', side: 2 },
            ],
          }),
          input({
            id: 2,
            round: 1,
            status: 'PLAYED',
            winnerSide: 1,
            side1Score: 2,
            side2Score: 0,
            players: [
              { displayName: 'Carol', side: 1 },
              { displayName: 'Dan', side: 2 },
            ],
          }),
          input({
            id: 3,
            round: 2,
            players: [
              { displayName: 'Alice', side: 1 },
              { displayName: 'Eve', side: 2 },
            ],
          }),
          input({
            id: 4,
            round: 2,
            players: [
              { displayName: 'Carol', side: 1 },
              { displayName: 'Fay', side: 2 },
            ],
          }),
        ],
      },
      'in_progress',
    );

    const firstRound = bracket.rounds[0];
    expect(firstRound?.matches).toHaveLength(4);
    expectUniqueIds(bracket.rounds);
    expect(firstRound?.matches.filter((match) => match.id === 1 || match.id === 2)).toHaveLength(2);
    expect(firstRound?.matches.filter((match) => match.isBye)).toHaveLength(2);
  });

  it('keeps irregular league round sizes when padByes is false', () => {
    const bracket = buildSingleElimBracket(
      {
        name: 'invite',
        matches: [
          input({ id: 1, round: 1 }),
          input({ id: 2, round: 1 }),
          input({ id: 3, round: 2 }),
          input({ id: 4, round: 2 }),
          input({ id: 5, round: 2 }),
        ],
      },
      'in_progress',
      { padByes: false },
    );

    expect(bracket.rounds[0]?.matches).toHaveLength(2);
    expect(bracket.rounds[1]?.matches).toHaveLength(3);
    expectUniqueIds(bracket.rounds);
  });
});
