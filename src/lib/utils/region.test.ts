import { describe, expect, it } from 'vitest';
import { getRegionAbbr, getRegionFlagCode, sortRegionsByAbbr } from './region';

describe('getRegionAbbr', () => {
  it('maps common league region names', () => {
    expect(getRegionAbbr('North America')).toBe('NA');
    expect(getRegionAbbr('NA')).toBe('NA');
    expect(getRegionAbbr('Europe')).toBe('EU');
    expect(getRegionAbbr('EU')).toBe('EU');
    expect(getRegionAbbr('South America')).toBe('SA');
    expect(getRegionAbbr('SA')).toBe('SA');
    expect(getRegionAbbr('Asia')).toBe('ASIA');
    expect(getRegionAbbr('Australia')).toBe('AUS');
    expect(getRegionAbbr('Oceania')).toBe('AUS');
  });

  it('falls back to a short label for unknown names', () => {
    expect(getRegionAbbr('E2E Region')).toBe('E2E');
    expect(getRegionAbbr('Latam')).toBe('LATAM');
  });
});

describe('getRegionFlagCode', () => {
  it('maps regions to flag-icons codes', () => {
    expect(getRegionFlagCode('North America')).toBe('us');
    expect(getRegionFlagCode('Europe')).toBe('eu');
    expect(getRegionFlagCode('South America')).toBe('br');
    expect(getRegionFlagCode('Asia')).toBe('sg');
    expect(getRegionFlagCode('Australia')).toBe('au');
    expect(getRegionFlagCode('xx')).toBe('xx');
    expect(getRegionFlagCode('Unknown Place')).toBe('');
  });
});

describe('sortRegionsByAbbr', () => {
  it('uses the conventional NA / SA / EU / ASIA / AUS order', () => {
    const sorted = sortRegionsByAbbr([
      { abbr: 'AUS' },
      { abbr: 'EU' },
      { abbr: 'NA' },
      { abbr: 'ASIA' },
      { abbr: 'SA' },
      { abbr: 'LATAM' },
    ]);
    expect(sorted.map((r) => r.abbr)).toEqual(['NA', 'SA', 'EU', 'ASIA', 'AUS', 'LATAM']);
  });
});
