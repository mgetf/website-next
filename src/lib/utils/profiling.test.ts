import { describe, expect, it } from 'vitest';
import {
  emptyProfilingSnapshot,
  formatProfilingCount,
  formatProfilingHours,
  formatProfilingScore,
  formatSteamAgeYears,
  formatSteamCreatedAt,
  headlineScore,
  highestClassScore,
  highestRegionScore,
  remainingScoreLabels,
  parseProfilingSnapshot,
  profilingCardChips,
} from './profiling';
import type { ProfilingSnapshot } from '#lib/types/profiling.js';

function snapshot(overrides: Partial<ProfilingSnapshot> = {}): ProfilingSnapshot {
  return { ...emptyProfilingSnapshot(), ...overrides };
}

describe('profiling snapshot formatters', () => {
  it('renders missing values as a dash', () => {
    expect(formatProfilingCount(null)).toBe('—');
    expect(formatProfilingHours(undefined)).toBe('—');
    expect(formatProfilingScore(null)).toBe('—');
    expect(formatSteamAgeYears(null)).toBe('—');
    expect(formatSteamCreatedAt(null)).toBe('—');
  });

  it('formats hours and account age for a glance', () => {
    expect(formatProfilingHours(4.2)).toBe('4.2');
    expect(formatProfilingHours(1240.4)).toBe('1,240');
    expect(formatProfilingScore(1604)).toBe('1604');
    expect(formatSteamAgeYears(0.4)).toBe('5 mo');
    expect(formatSteamAgeYears(12.4)).toBe('12y');
    expect(formatSteamCreatedAt('2014-03-18T00:00:00.000Z')).toBe('Mar 2014');
  });

  it('picks the highest region and class scores', () => {
    const data = snapshot({
      scores: [
        { region: 'na', score: 1604 },
        { region: 'eu', score: 1480 },
      ],
      classScores: [
        { classId: 3, className: 'Soldier', region: 'na', score: 1720 },
        { classId: 1, className: 'Scout', region: 'na', score: 1400 },
      ],
    });
    expect(highestRegionScore(data.scores)?.score).toBe(1604);
    expect(highestClassScore(data.classScores)?.className).toBe('Soldier');
    expect(headlineScore(data)).toBe(1720);
    expect(remainingScoreLabels(data)).toEqual([
      'NA 1604',
      'Soldier 1720',
      'EU 1480',
      'Scout 1400',
    ]);
  });

  it('builds placement chips from present numbers only', () => {
    const data = snapshot({
      steamAgeYears: 12.2,
      steamLevel: 42,
      gameCount: 180,
      tf2Hours: 1240,
      scores: [{ region: 'na', score: 1604 }],
      classScores: [{ classId: 3, className: 'Soldier', region: 'na', score: 1720 }],
      logsTfCount: 3412,
      mgeServerHours: 36.4,
    });
    expect(profilingCardChips(data).map((chip) => [chip.key, chip.value])).toEqual([
      ['tf2', '1240h'],
      ['steam', '12y'],
      ['mge', '36h'],
      ['score', '1604'],
      ['logs', '3412'],
    ]);
  });

  it('omits chips when a source is missing', () => {
    expect(profilingCardChips(snapshot()).map((chip) => [chip.key, chip.value])).toEqual([
      ['tf2', '?'],
      ['mge', '0h'],
    ]);
    expect(
      profilingCardChips(snapshot({ tf2Hours: 12, logsTfCount: 4 })).map((chip) => chip.key),
    ).toEqual(['tf2', 'mge', 'logs']);
    expect(
      profilingCardChips(
        snapshot({
          steamLevel: 42,
          gameCount: 180,
          classScores: [{ classId: 3, className: 'Soldier', region: 'na', score: 1720 }],
        }),
      ).map((chip) => [chip.key, chip.value]),
    ).toEqual([
      ['tf2', '?'],
      ['mge', '0h'],
    ]);
  });

  it('shows a question mark instead of 0 TF2 hours', () => {
    expect(
      profilingCardChips(snapshot({ tf2Hours: 0 })).map((chip) => [chip.key, chip.value]),
    ).toEqual([
      ['tf2', '?'],
      ['mge', '0h'],
    ]);
  });

  it('shows 0h on mge.tf instead of hiding the chip', () => {
    expect(
      profilingCardChips(snapshot({ mgeServerHours: 0 })).map((chip) => [chip.key, chip.value]),
    ).toEqual([
      ['tf2', '?'],
      ['mge', '0h'],
    ]);
  });

  it('parses a stored cache row and ignores junk fields', () => {
    const parsed = parseProfilingSnapshot(
      {
        steamAgeYears: 12,
        steamCreatedAt: '2014-03-18T00:00:00.000Z',
        steamLevel: 42,
        gameCount: 180,
        tf2Hours: 1240,
        profilePublic: true,
        scores: [{ region: 'na', score: 1604 }],
        classScores: [{ classId: 3, className: 'Soldier', region: 'na', score: 1720 }],
        logsTfCount: 3412,
        mgeServerHours: 36,
        extra: 'nope',
      },
      '2026-10-05T14:00:00.000Z',
    );
    expect(parsed?.steamLevel).toBe(42);
    expect(parsed?.scores).toEqual([{ region: 'na', score: 1604 }]);
    expect(parsed?.cachedAt).toBe('2026-10-05T14:00:00.000Z');
    expect(parsed && 'extra' in parsed).toBe(false);
  });

  it('returns null for a cache payload that is not an object', () => {
    expect(parseProfilingSnapshot(null)).toBeNull();
    expect(parseProfilingSnapshot('nope')).toBeNull();
  });
});
