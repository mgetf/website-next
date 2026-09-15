import { getPlayerServerStats as fetchPlatformServerStats } from '$lib/server/clients/mgePlatform';
import { getUserDisplaysByIds } from '$lib/server/services/users';
import type { PlayerFoe, PlayerServerStats, StatsWindow } from '$lib/types/profile';

const DEFAULT_AVATAR = '/default-avatar.png';

/** Fresh copy is reused until this TTL; the next request after expiry refetches. */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** If platform is down, serve the last good copy for this long. */
const STALE_FALLBACK_MS = 15 * 60 * 1000;

interface CacheEntry {
  value: PlayerServerStats;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PlayerServerStats | null>>();

function normalizeDays(days?: StatsWindow | string): string {
  if (days === 7 || days === 30 || days === 90 || days === '7' || days === '30' || days === '90') {
    return String(days);
  }
  return 'all';
}

function cacheKey(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
): string {
  const region = opts.region.trim().toLowerCase();
  const days = normalizeDays(opts.days);
  const tz = opts.tz?.trim() ?? '';
  return `${steamId}:${region}:${days}:${tz}`;
}

function prune(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt >= STALE_FALLBACK_MS) cache.delete(key);
  }
}

function avatarFor(
  steam64: string | null,
  displays: Record<string, { avatar: string | null }>,
): string {
  if (!steam64) return DEFAULT_AVATAR;
  return displays[steam64]?.avatar || DEFAULT_AVATAR;
}

function withFoeAvatar(
  foe: Omit<PlayerFoe, 'avatar'> | PlayerFoe | null,
  displays: Record<string, { avatar: string | null }>,
): PlayerFoe | null {
  if (!foe) return null;
  return { ...foe, avatar: avatarFor(foe.steam64, displays) };
}

async function loadEnriched(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
): Promise<PlayerServerStats | null> {
  const stats = await fetchPlatformServerStats(steamId, opts);
  if (!stats) return null;

  const steam64s = new Set<string>();
  const collect = (id: string | null | undefined) => {
    if (id) steam64s.add(id);
  };
  for (const foe of stats.foes) collect(foe.steam64);
  collect(stats.rivals.nemesis?.steam64);
  collect(stats.rivals.dominated?.steam64);
  collect(stats.rivals.frequent?.steam64);
  for (const duel of stats.recentDuels) collect(duel.opponentSteam64);
  for (const row of stats.recentDoubles) {
    collect(row.partnerSteam64);
    for (const opponent of row.opponents) collect(opponent.steam64);
  }

  const displays = await getUserDisplaysByIds([...steam64s]);

  return {
    ...stats,
    foes: stats.foes.map((foe) => withFoeAvatar(foe, displays)!),
    rivals: {
      nemesis: withFoeAvatar(stats.rivals.nemesis, displays),
      dominated: withFoeAvatar(stats.rivals.dominated, displays),
      frequent: withFoeAvatar(stats.rivals.frequent, displays),
    },
    recentDuels: stats.recentDuels.map((duel) => ({
      ...duel,
      opponentAvatar: avatarFor(duel.opponentSteam64, displays),
    })),
    recentDoubles: stats.recentDoubles.map((row) => ({
      ...row,
      partnerAvatar: avatarFor(row.partnerSteam64, displays),
      opponents: row.opponents.map((opponent) => ({
        ...opponent,
        avatar: avatarFor(opponent.steam64, displays),
      })),
    })),
  };
}

async function refresh(
  key: string,
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
  stale: CacheEntry | undefined,
): Promise<PlayerServerStats | null> {
  try {
    const stats = await loadEnriched(steamId, opts);
    if (stats) {
      cache.set(key, { value: stats, cachedAt: Date.now() });
      return stats;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[playerStats] Failed to fetch server stats: ${message}`);
  }

  if (stale && Date.now() - stale.cachedAt < STALE_FALLBACK_MS) {
    return stale.value;
  }
  return null;
}

/**
 * Clears the in-process stats cache. Used by unit tests.
 */
export function resetPlayerServerStatsCache(): void {
  cache.clear();
  inflight.clear();
}

/**
 * True when this key can be served from memory (fresh TTL or an in-flight
 * refresh). The HTTP route uses this to skip rate limiting cache hits.
 */
export function isPlayerServerStatsWarm(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
): boolean {
  const key = cacheKey(steamId, opts);
  const now = Date.now();
  prune(now);
  const hit = cache.get(key);
  if (hit && now - hit.cachedAt < CACHE_TTL_MS) return true;
  return inflight.has(key);
}

export async function getEnrichedPlayerServerStats(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string },
): Promise<PlayerServerStats | null> {
  const key = cacheKey(steamId, opts);
  const now = Date.now();
  prune(now);

  const hit = cache.get(key);
  if (hit && now - hit.cachedAt < CACHE_TTL_MS) {
    return hit.value;
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = refresh(key, steamId, opts, hit);
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}
