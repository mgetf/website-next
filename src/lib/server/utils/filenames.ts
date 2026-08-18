/**
 * Safe filename helpers for uploads.
 * Never embed raw client-supplied names in filesystem paths or object keys.
 */

import { randomBytes } from 'crypto';

/**
 * Build a storage-safe demo filename: `<timestamp>-<random>.dem`.
 * Ignores the original client filename entirely (aside from prior extension checks).
 */
export function safeDemoStorageName(originalFilename?: string): string {
  // Keep the original name only for logging callers; never for storage.
  void originalFilename;
  return `${Date.now()}-${randomBytes(8).toString('hex')}.dem`;
}

/**
 * Ensure a generated basename cannot escape its parent directory.
 */
export function assertSafeBasename(name: string): string {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..') || name === '.') {
    throw new Error('Unsafe filename');
  }
  return name;
}
