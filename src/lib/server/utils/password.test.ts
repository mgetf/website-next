import { describe, expect, it } from 'vitest';
import { hashPassword, isHashedPassword, verifyPassword } from './password';
import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

async function makeLegacyHash(password: string): Promise<string> {
  const salt = crypto.randomBytes(32);
  const hash = (await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

describe('hashPassword', () => {
  it('returns a versioned scrypt hash', async () => {
    const hashed = await hashPassword('secret');
    expect(hashed).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
  });

  it('uses a unique salt each time', async () => {
    const a = await hashPassword('secret');
    const b = await hashPassword('secret');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('verifies a freshly hashed password', async () => {
    const hashed = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hashed)).toBe(true);
    expect(await verifyPassword('wrong', hashed)).toBe(false);
  });

  it('verifies legacy salt:hash values', async () => {
    const legacy = await makeLegacyHash('legacy-pass');
    expect(await verifyPassword('legacy-pass', legacy)).toBe(true);
    expect(await verifyPassword('nope', legacy)).toBe(false);
  });

  it('rejects plaintext and garbage without falling back', async () => {
    expect(await verifyPassword('plaintext', 'plaintext')).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});

describe('isHashedPassword', () => {
  it('recognizes versioned and legacy hashes', async () => {
    expect(isHashedPassword(await hashPassword('a'))).toBe(true);
    expect(isHashedPassword(await makeLegacyHash('a'))).toBe(true);
  });

  it('rejects plaintext values', () => {
    expect(isHashedPassword('team-password')).toBe(false);
    expect(isHashedPassword('')).toBe(false);
    expect(isHashedPassword('onlyonepart')).toBe(false);
  });
});
