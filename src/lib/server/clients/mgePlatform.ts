import { env } from '$env/dynamic/private';
import type { MgeRating, PlatformRegion } from '$lib/types/mge';
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
    return ((data.ratings ?? []) as MgeRating[]).map((r) => ({
      ...r,
      rd: r.rd ?? null,
      volatility: r.volatility ?? null,
      displayRating: r.displayRating ?? r.elo,
      provisional: r.provisional ?? false,
    }));
  } catch {
    return [];
  }
}

function parseRegions(raw: unknown): PlatformRegion[] {
  if (!Array.isArray(raw)) return [];
  const regions: PlatformRegion[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && item.length > 0) {
      regions.push({ code: item, flag: null });
      continue;
    }
    if (!item || typeof item !== 'object' || !('code' in item)) continue;
    const code = (item as { code: unknown }).code;
    if (typeof code !== 'string' || code.length === 0) continue;
    const flag = (item as { flag?: unknown }).flag;
    regions.push({
      code,
      flag: typeof flag === 'string' && flag.length > 0 ? flag : null,
    });
  }
  return regions;
}

export async function getRegions(): Promise<PlatformRegion[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/v1/regions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return parseRegions(data.regions);
  } catch {
    return [];
  }
}

export interface PlatformLeaderboardEntry {
  steamId: string;
  name: string | null;
  elo: number;
  rd: number | null;
  volatility: number | null;
  displayRating: number;
  provisional: boolean;
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
      entries: ((data.entries ?? []) as PlatformLeaderboardEntry[]).map((e) => ({
        ...e,
        rd: e.rd ?? null,
        volatility: e.volatility ?? null,
        displayRating: e.displayRating ?? e.elo,
        provisional: e.provisional ?? false,
      })),
    };
  } catch {
    return empty;
  }
}
