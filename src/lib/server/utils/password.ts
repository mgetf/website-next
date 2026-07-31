/**
 * Password Hashing Utilities
 * Uses Node.js crypto with scrypt for secure password hashing
 * No external dependencies required
 */

import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// Configuration
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;

/** Current hashing cost (2^15). Stored in the hash so params can change over time. */
const SCRYPT_PARAMS = {
  N: 32768,
  r: 8,
  p: 1,
  // OpenSSL default maxmem (32 MiB) is just under 128*r*N for N=32768; raise the ceiling.
  maxmem: 64 * 1024 * 1024,
};

/** Legacy salt:hash values were produced with N=16384 before params were embedded. */
const LEGACY_SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

type ScryptParams = { N: number; r: number; p: number; maxmem: number };

/**
 * Hash a password using scrypt.
 * Returns: scrypt$N$r$p$salt$hash (base64 salt/hash)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = (await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;

  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function parseLegacyHash(
  storedValue: string,
): { salt: Buffer; hash: Buffer; params: ScryptParams } | null {
  const parts = storedValue.split(':');
  if (parts.length !== 2) return null;

  const [saltBase64, hashBase64] = parts;
  if (!saltBase64 || !hashBase64) return null;

  try {
    const salt = Buffer.from(saltBase64, 'base64');
    const hash = Buffer.from(hashBase64, 'base64');
    if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) return null;
    return { salt, hash, params: LEGACY_SCRYPT_PARAMS };
  } catch {
    return null;
  }
}

function parseVersionedHash(
  storedValue: string,
): { salt: Buffer; hash: Buffer; params: ScryptParams } | null {
  const parts = storedValue.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltBase64 = parts[4];
  const hashBase64 = parts[5];

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N < 2 || (N & (N - 1)) !== 0) return null;
  if (!saltBase64 || !hashBase64) return null;

  try {
    const salt = Buffer.from(saltBase64, 'base64');
    const hash = Buffer.from(hashBase64, 'base64');
    if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) return null;
    return { salt, hash, params: { N, r, p, maxmem: 64 * 1024 * 1024 } };
  } catch {
    return null;
  }
}

/**
 * Check whether a stored value is a recognized scrypt hash (versioned or legacy),
 * as opposed to a legacy plaintext value.
 * @lintignore used by scripts/migrate-plaintext-join-passwords.ts
 */
export function isHashedPassword(storedValue: string): boolean {
  return parseVersionedHash(storedValue) !== null || parseLegacyHash(storedValue) !== null;
}

/**
 * Verify a password against a stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parsed = parseVersionedHash(storedHash) ?? parseLegacyHash(storedHash);
    if (!parsed) {
      // Not a recognized hash. Legacy plaintext passwords must be migrated via
      // scripts/migrate-plaintext-join-passwords.ts before this check is reached.
      return false;
    }

    const hash = (await scryptAsync(password, parsed.salt, KEY_LENGTH, parsed.params)) as Buffer;
    return crypto.timingSafeEqual(hash, parsed.hash);
  } catch {
    return false;
  }
}
