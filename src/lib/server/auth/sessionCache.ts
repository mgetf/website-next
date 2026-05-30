/**
 * Session Version Cache
 *
 * In-process TTL cache for sessionVersion values fetched from Postgres.
 * Without this, hooks.server.ts issues one DB query per request for every
 * logged-in user, making the database a hard dependency for every page render.
 *
 * With a 15-second TTL, ban and permission-level changes propagate within
 * 15 seconds. The cache is invalidated eagerly on incrementSessionVersion so
 * same-process propagation is effectively immediate.
 *
 * In a multi-replica deployment the TTL window (15 s) is the worst-case
 * propagation delay for the replica that did not perform the increment.
 */

const TTL_MS = 15_000;

interface CacheEntry {
  version: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Returns the cached session version for a user, or null if the entry is
 * absent or has expired. A null return means the caller must query the DB.
 */
export function getCachedSessionVersion(steamId: string): number | null {
  const entry = cache.get(steamId);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(steamId);
    return null;
  }
  return entry.version;
}

/**
 * Stores a session version in the cache with a fresh TTL.
 */
export function setCachedSessionVersion(steamId: string, version: number): void {
  cache.set(steamId, { version, expiresAt: Date.now() + TTL_MS });
}

/**
 * Removes a user's entry from the cache, forcing the next request to
 * re-query the DB. Called after incrementSessionVersion to ensure that
 * a ban or role change takes effect on the very next request within this
 * process, rather than waiting for the TTL to expire.
 */
export function invalidateCachedSessionVersion(steamId: string): void {
  cache.delete(steamId);
}
