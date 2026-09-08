import { describe, expect, it } from 'vitest';
import { flagForRegion, resolveRegionFlag } from './regions';

describe('resolveRegionFlag', () => {
  it('passes through ISO codes from the panel', () => {
    expect(resolveRegionFlag('br')).toBe('br');
    expect(resolveRegionFlag('SG')).toBe('sg');
    expect(resolveRegionFlag('eu')).toBe('eu');
  });

  it('returns empty when no flag was provided', () => {
    expect(resolveRegionFlag(undefined)).toBe('');
    expect(resolveRegionFlag(null)).toBe('');
    expect(resolveRegionFlag('')).toBe('');
    expect(resolveRegionFlag('South America')).toBe('');
  });
});

describe('flagForRegion', () => {
  it('uses the flag from the region list when present', () => {
    expect(flagForRegion('sa', [{ code: 'sa', flag: 'br' }])).toBe('br');
  });

  it('falls back to the shared defaults when the list has no flag', () => {
    expect(flagForRegion('sa', [{ code: 'sa', flag: null }])).toBe('ar');
    expect(flagForRegion('NA')).toBe('us');
    expect(flagForRegion('sa')).toBe('ar');
    expect(flagForRegion('eu')).toBe('eu');
    expect(flagForRegion('asia')).toBe('sg');
    expect(flagForRegion('aus')).toBe('au');
    expect(flagForRegion('oce')).toBe('au');
  });

  it('returns empty for unknown codes', () => {
    expect(flagForRegion('xx')).toBe('');
    expect(flagForRegion('latam', [])).toBe('');
  });
});
