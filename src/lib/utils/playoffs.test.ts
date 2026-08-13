import { describe, expect, it } from 'vitest';
import { compareMatchHistoryOrder, formatPlayoffRound, playoffRoundSortKey } from './playoffs';

describe('formatPlayoffRound', () => {
  it('labels positive rounds as upper bracket', () => {
    expect(formatPlayoffRound(1)).toBe('Upper Round 1');
    expect(formatPlayoffRound(0)).toBe('Upper Round 0');
  });

  it('labels negative rounds as lower bracket using absolute value', () => {
    expect(formatPlayoffRound(-1)).toBe('Lower Round 1');
    expect(formatPlayoffRound(-3)).toBe('Lower Round 3');
  });
});

describe('playoffRoundSortKey', () => {
  it('interleaves upper then lower rounds chronologically', () => {
    expect(playoffRoundSortKey(1)).toBe(1);
    expect(playoffRoundSortKey(-1)).toBe(2);
    expect(playoffRoundSortKey(2)).toBe(3);
    expect(playoffRoundSortKey(-2)).toBe(4);
  });
});

describe('compareMatchHistoryOrder', () => {
  it('orders regular season before playoffs, weeks ascending', () => {
    const entries = [
      { weekNo: null, playoffRound: 1, id: 10 },
      { weekNo: 2, playoffRound: null, id: 2 },
      { weekNo: null, playoffRound: -1, id: 11 },
      { weekNo: 1, playoffRound: null, id: 1 },
      { weekNo: 1, playoffRound: null, id: 3 },
    ];

    const sorted = [...entries].sort(compareMatchHistoryOrder);
    expect(sorted.map((e) => e.id)).toEqual([1, 3, 2, 10, 11]);
  });
});
