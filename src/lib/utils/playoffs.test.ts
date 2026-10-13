import { describe, expect, it } from 'vitest';
import {
  compareMatchHistoryOrder,
  formatPlayoffRound,
  formatPlayoffSlotLabel,
  playoffRoundSortKey,
} from './playoffs';

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

describe('formatPlayoffSlotLabel', () => {
  it('names single elimination from the end of the bracket', () => {
    expect(formatPlayoffSlotLabel('MAIN', 1, 3)).toBe('Quarterfinals');
    expect(formatPlayoffSlotLabel('MAIN', 2, 3)).toBe('Semifinals');
    expect(formatPlayoffSlotLabel('MAIN', 3, 3)).toBe('Final');
  });

  it('names winners and losers rounds, and the grand final reset', () => {
    expect(formatPlayoffSlotLabel('WINNERS', 1, 3)).toBe('Winners Round 1');
    expect(formatPlayoffSlotLabel('WINNERS', 3, 3)).toBe('Winners Final');
    expect(formatPlayoffSlotLabel('LOSERS', 2, 4)).toBe('Losers Round 2');
    expect(formatPlayoffSlotLabel('LOSERS', 4, 4)).toBe('Losers Final');
    expect(formatPlayoffSlotLabel('GRAND_FINAL', 1, 1)).toBe('Grand Final');
    expect(formatPlayoffSlotLabel('GRAND_FINAL', 2, 2)).toBe('Grand Final Reset');
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
