import { env } from '$env/dynamic/private';
import type { MgeRating } from '$lib/types/mge';
import { steamId32FromSteamId64 } from '$lib/utils/steamid';

function getPlatformUrl(): string {
  return (env.MGE_PLATFORM_URL ?? '').replace(/\/$/, '');
}

export async function getPlayerRatings(steamId: string): Promise<MgeRating[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  const steam2Id = steamId32FromSteamId64(steamId);
  try {
    const res = await fetch(`${base}/api/v1/players/${encodeURIComponent(steam2Id)}/ratings`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.ratings ?? []) as MgeRating[];
  } catch {
    return [];
  }
}

/**
 * Platform `/api/v1/regions` currently returns `{ code, flag }` objects.
 * Older payloads were bare strings — accept both so a shape change cannot 500 the site.
 */
export function parsePlatformRegionCodes(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || !('regions' in payload)) return [];
  const regions = (payload as { regions: unknown }).regions;
  if (!Array.isArray(regions)) return [];

  const codes: string[] = [];
  for (const region of regions) {
    if (typeof region === 'string') {
      const code = region.trim();
      if (code) codes.push(code);
      continue;
    }
    if (region && typeof region === 'object' && 'code' in region) {
      const code = (region as { code: unknown }).code;
      if (typeof code === 'string' && code.trim()) codes.push(code.trim());
    }
  }
  return codes;
}

export async function getRegions(): Promise<string[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/v1/regions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return parsePlatformRegionCodes(await res.json());
  } catch {
    return [];
  }
}

export interface PlatformLeaderboardEntry {
  steamId: string;
  name: string | null;
  elo: number;
  eloRank: number;
  wins: number | null;
  losses: number | null;
  lastPlayed: string | null;
}

export interface PlatformLeaderboardResponse {
  region: string;
  total: number;
  limit: number;
  offset: number;
  entries: PlatformLeaderboardEntry[];
}

export type LeaderboardSortField = 'elo' | 'wins' | 'losses' | 'games' | 'winrate' | 'lastPlayed';

export type LeaderboardSortDir = 'asc' | 'desc';

export async function getLeaderboard(
  region: string,
  limit: number,
  offset = 0,
  minElo?: number,
  sortBy: LeaderboardSortField = 'elo',
  sortDir: LeaderboardSortDir = 'desc',
): Promise<PlatformLeaderboardResponse> {
  const empty: PlatformLeaderboardResponse = { region, total: 0, limit, offset, entries: [] };
  const base = getPlatformUrl();
  if (!base) return empty;
  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (minElo !== undefined) params.set('minElo', String(minElo));
    if (sortBy !== 'elo') params.set('sortBy', sortBy);
    if (sortDir !== 'desc') params.set('sortDir', sortDir);
    const url = `${base}/api/v1/regions/${encodeURIComponent(region)}/leaderboard?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      region: data.region ?? region,
      total: Number(data.total ?? 0),
      limit: Number(data.limit ?? limit),
      offset: Number(data.offset ?? offset),
      entries: (data.entries ?? []) as PlatformLeaderboardEntry[],
    };
  } catch {
    return empty;
  }
}
