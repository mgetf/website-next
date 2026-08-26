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

  it('returns empty when the list has no flag', () => {
    expect(flagForRegion('sa', [{ code: 'sa', flag: null }])).toBe('');
    expect(flagForRegion('na', [])).toBe('');
  });
});
