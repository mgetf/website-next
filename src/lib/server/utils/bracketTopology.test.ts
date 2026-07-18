import { describe, expect, it } from 'vitest';
import {
  deriveSection,
  inferBracketTopology,
  isStructurallyFlat,
  type TopologyMatchInput,
} from '$lib/server/utils/bracketTopology';

function topologyMatch(
  id: number,
  round: number | null,
  orderNum: number,
  first: { steamId: string; name: string },
  second: { steamId: string; name: string },
  winnerSide: number | null,
  label: string | null = null,
): TopologyMatchInput {
  return {
    id,
    round,
    orderNum,
    label,
    winnerSide,
    players: [
      { side: 1, steamId: first.steamId, displayName: first.name },
      { side: 2, steamId: second.steamId, displayName: second.name },
    ],
  };
}

describe('bracket topology inference', () => {
  it('follows Steam IDs when two players share a display name', () => {
    const alpha = { steamId: 'alpha', name: 'Same Name' };
    const beta = { steamId: 'beta', name: 'Same Name' };
    const gamma = { steamId: 'gamma', name: 'Gamma' };
    const delta = { steamId: 'delta', name: 'Delta' };
    const matches = [
      topologyMatch(1, 1, 1, alpha, gamma, 1),
      topologyMatch(2, 1, 2, beta, delta, 1),
      topologyMatch(3, 2, 3, beta, alpha, 2),
    ];

    const result = inferBracketTopology(matches, 'SINGLE_ELIM');

    expect(result.find((match) => match.id === 1)).toMatchObject({
      winnerNextMatchId: 3,
      winnerNextSide: 2,
    });
    expect(result.find((match) => match.id === 2)).toMatchObject({
      winnerNextMatchId: 3,
      winnerNextSide: 1,
    });
  });

  it('assigns winners, losers, and grand-final sections from labels before round signs', () => {
    expect(deriveSection({ round: 2, label: 'Losers Round 2' }, 'DOUBLE_ELIM')).toBe('LOSERS');
    expect(deriveSection({ round: 5, label: 'Grand Final Reset' }, 'DOUBLE_ELIM')).toBe(
      'GRAND_FINAL',
    );
    expect(deriveSection({ round: -1, label: 'Winners Round 1' }, 'DOUBLE_ELIM')).toBe('WINNERS');
  });

  it('recognizes a flat historical qualifier', () => {
    expect(isStructurallyFlat([{ round: null }, { round: null }])).toBe(true);
    expect(isStructurallyFlat([{ round: null }, { round: 1 }])).toBe(false);
  });
});
