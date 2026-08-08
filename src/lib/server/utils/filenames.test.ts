import { describe, expect, it } from 'vitest';
import { assertSafeBasename, safeDemoStorageName } from './filenames';

describe('safeDemoStorageName', () => {
  it('returns a timestamped .dem name and ignores client path segments', () => {
    const name = safeDemoStorageName('../../etc/passwd.dem');
    expect(name).toMatch(/^\d+-[a-f0-9]+\.dem$/);
    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
  });
});

describe('assertSafeBasename', () => {
  it('accepts plain basenames', () => {
    expect(assertSafeBasename('123-abcd.dem')).toBe('123-abcd.dem');
  });

  it('rejects path traversal attempts', () => {
    expect(() => assertSafeBasename('../x.dem')).toThrow(/Unsafe/);
    expect(() => assertSafeBasename('a/b.dem')).toThrow(/Unsafe/);
    expect(() => assertSafeBasename('a\\b.dem')).toThrow(/Unsafe/);
  });
});
