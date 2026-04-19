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
 * Verify a password against a stored hash
 * Uses timing-safe comparison to prevent timing attacks
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    // Split stored hash into salt and hash components
    const [saltBase64, hashBase64] = storedHash.split(':');

    if (!saltBase64 || !hashBase64) {
      // Invalid hash format - likely a plaintext password from before migration
      // For backwards compatibility during migration, allow direct comparison
      // TODO: Remove this fallback after all passwords are migrated
      return password === storedHash;
    }

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
