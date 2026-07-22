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
const SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost parameter (2^14)
  r: 8, // Block size
  p: 1, // Parallelization parameter
};

/**
 * Hash a password using scrypt
 * Returns a string in format: salt:hash
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate a random salt
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Hash the password with the salt
  const hash = (await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;

  // Return salt and hash as base64 strings, separated by colon
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

/**
 * Check whether a stored value is in the `salt:hash` format produced by
 * hashPassword(), as opposed to a legacy plaintext value.
 */
export function isHashedPassword(storedValue: string): boolean {
  const parts = storedValue.split(':');
  if (parts.length !== 2) return false;

  const [saltBase64, hashBase64] = parts;
  if (!saltBase64 || !hashBase64) return false;

  try {
    const salt = Buffer.from(saltBase64, 'base64');
    const hash = Buffer.from(hashBase64, 'base64');
    return salt.length === SALT_LENGTH && hash.length === KEY_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Verify a password against a stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (!isHashedPassword(storedHash)) {
      // Not a recognized salt:hash value. Legacy plaintext passwords must be
      // migrated via scripts/migrate-plaintext-join-passwords.ts before this
      // check is reached in production.
      return false;
    }

    const [saltBase64, hashBase64] = storedHash.split(':');
    const salt = Buffer.from(saltBase64, 'base64');
    const storedHashBuffer = Buffer.from(hashBase64, 'base64');

    // Hash the provided password with the same salt
    const hash = (await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(hash, storedHashBuffer);
  } catch {
    return false;
  }
}
