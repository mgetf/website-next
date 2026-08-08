import { describe, expect, it } from 'vitest';
import {
  getCachedSessionVersion,
  invalidateCachedSessionVersion,
  setCachedSessionVersion,
} from './sessionCache';

describe('sessionVersion cache', () => {
  it('returns cached values until invalidated', () => {
    const steamId = `cache-test-${Date.now()}`;
    expect(getCachedSessionVersion(steamId)).toBeNull();

    setCachedSessionVersion(steamId, 7);
    expect(getCachedSessionVersion(steamId)).toBe(7);

    invalidateCachedSessionVersion(steamId);
    expect(getCachedSessionVersion(steamId)).toBeNull();
  });
});
