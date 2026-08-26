import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { parsePlatformRegionCodes } from './mgePlatform';

describe('parsePlatformRegionCodes', () => {
  it('reads the current { code, flag } payload', () => {
    expect(
      parsePlatformRegionCodes({
        regions: [
          { code: 'asia', flag: 'sg' },
          { code: 'eu', flag: 'eu' },
          { code: 'na', flag: 'us' },
          { code: 'sa', flag: 'ar' },
        ],
      }),
    ).toEqual(['asia', 'eu', 'na', 'sa']);
  });

  it('reads the legacy string[] payload', () => {
    expect(parsePlatformRegionCodes({ regions: ['na', 'eu'] })).toEqual(['na', 'eu']);
  });

  it('ignores malformed entries and empty payloads', () => {
    expect(parsePlatformRegionCodes(null)).toEqual([]);
    expect(parsePlatformRegionCodes({})).toEqual([]);
    expect(parsePlatformRegionCodes({ regions: [{ flag: 'us' }, '', { code: 'na' }] })).toEqual([
      'na',
    ]);
  });
});
