import { describe, expect, it } from 'vitest';
import { hashApiKey } from './apiKeys';

describe('hashApiKey', () => {
  it('returns a stable sha256 hex digest', () => {
    const key = 'mge_' + 'a'.repeat(64);
    const hash = hashApiKey(key);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashApiKey(key)).toBe(hash);
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('mge_' + 'a'.repeat(64))).not.toBe(hashApiKey('mge_' + 'b'.repeat(64)));
  });
});
