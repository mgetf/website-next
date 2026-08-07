import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '$prisma/client.js';
import {
  calculatePointsPerGame,
  calculateWeekLabel,
  calculateWinLossRatio,
  canDisputeMatch,
} from './matchHelpers';

function partial(overrides: Partial<Match>): Match {
  return overrides as Match;
}

describe('calculateWeekLabel', () => {
  it('returns null when weekNo is missing', () => {
    expect(calculateWeekLabel(partial({ id: 1, weekNo: null }), [{ id: 1 }])).toBeNull();
  });

  it('returns plain week number for a single match week', () => {
    expect(calculateWeekLabel(partial({ id: 1, weekNo: 3 }), [{ id: 1 }])).toBe('3');
  });

  it('adds letter suffixes for multi-match weeks', () => {
    const siblings = [{ id: 10 }, { id: 11 }, { id: 12 }];
    expect(calculateWeekLabel(partial({ id: 10, weekNo: 1 }), siblings)).toBe('1a');
    expect(calculateWeekLabel(partial({ id: 11, weekNo: 1 }), siblings)).toBe('1b');
    expect(calculateWeekLabel(partial({ id: 12, weekNo: 1 }), siblings)).toBe('1c');
  });

  it('falls back to week number when match is missing from siblings', () => {
    expect(calculateWeekLabel(partial({ id: 99, weekNo: 2 }), [{ id: 1 }, { id: 2 }])).toBe('2');
  });
});

describe('canDisputeMatch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows disputes for PLAYED matches within 24 hours', () => {
    expect(
      canDisputeMatch(
        partial({
          status: 'PLAYED',
          submittedAt: new Date('2026-07-01T00:00:00Z'),
        }),
      ),
    ).toBe(true);
  });

  it('rejects disputes after the 24 hour window', () => {
    expect(
      canDisputeMatch(
        partial({
          status: 'PLAYED',
          submittedAt: new Date('2026-06-30T12:00:00Z'),
        }),
      ),
    ).toBe(false);
  });

  it('rejects non-PLAYED matches and missing submittedAt', () => {
    expect(canDisputeMatch(partial({ status: 'UNPLAYED', submittedAt: new Date() }))).toBe(false);
    expect(canDisputeMatch(partial({ status: 'PLAYED', submittedAt: null }))).toBe(false);
  });
});

describe('calculateWinLossRatio', () => {
  it('returns wins when there are no losses', () => {
    expect(calculateWinLossRatio(10, 0)).toBe(10);
    expect(calculateWinLossRatio(0, 0)).toBe(0);
  });

  it('returns win rate when losses exist', () => {
    expect(calculateWinLossRatio(10, 5)).toBeCloseTo(10 / 15);
    expect(calculateWinLossRatio(0, 4)).toBe(0);
  });
});

describe('calculatePointsPerGame', () => {
  it('averages points across games', () => {
    expect(calculatePointsPerGame(30, 2, 1)).toBe(10);
  });

  it('returns 0 when no games have been played', () => {
    expect(calculatePointsPerGame(10, 0, 0)).toBe(0);
  });
});
