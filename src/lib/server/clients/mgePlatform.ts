import { MGE_PLATFORM_URL } from '$app/env/private';
import type { MgeClasseloRating, MgeRating, PlatformRegion } from '#lib/types/mge.js';
import type { InvestigateResult } from '#lib/types/investigation.js';
import type { PlayerServerStats, ProfileChatPage, StatsWindow } from '#lib/types/profile.js';
import { steamId32FromSteamId64 } from '#lib/utils/steamid.js';
import { getPlatformAdminSecret } from '#lib/server/utils/env.js';

function getPlatformUrl(): string {
  return (MGE_PLATFORM_URL ?? '').replace(/\/$/, '');
}

function mapRatingFields<T extends MgeRating>(rating: T): T {
  return {
    ...rating,
    rd: rating.rd ?? null,
    volatility: rating.volatility ?? null,
    displayRating: rating.elo,
    provisional: rating.provisional ?? false,
  };
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
    return ((data.ratings ?? []) as MgeRating[]).map((r) => mapRatingFields(r));
  } catch {
    return [];
  }
}

export async function getPlayerClasselo(steamId: string): Promise<MgeClasseloRating[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  const steam2Id = steamId32FromSteamId64(steamId);
  try {
    const res = await fetch(`${base}/api/v1/players/${encodeURIComponent(steam2Id)}/classelo`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return ((data.ratings ?? []) as MgeClasseloRating[]).map((r) => ({
      ...mapRatingFields(r),
      eloRank: r.eloRank ?? null,
    }));
  } catch {
    return [];
  }
}

/**
 * Platform `/api/v1/regions` currently returns `{ code, flag }` objects.
 * Older payloads were bare strings — accept both so a shape change cannot 500 the site.
 */
function parseRegions(raw: unknown): PlatformRegion[] {
  if (!Array.isArray(raw)) return [];
  const regions: PlatformRegion[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const code = item.trim();
      if (code) regions.push({ code, flag: null });
      continue;
    }
    if (!item || typeof item !== 'object' || !('code' in item)) continue;
    const code = (item as { code: unknown }).code;
    if (typeof code !== 'string' || !code.trim()) continue;
    const flag = (item as { flag?: unknown }).flag;
    regions.push({
      code: code.trim(),
      flag: typeof flag === 'string' && flag.length > 0 ? flag : null,
    });
  }
  return regions;
}

function parsePlatformRegions(payload: unknown): PlatformRegion[] {
  if (!payload || typeof payload !== 'object' || !('regions' in payload)) return [];
  return parseRegions((payload as { regions: unknown }).regions);
}

export function parsePlatformRegionCodes(payload: unknown): string[] {
  return parsePlatformRegions(payload).map((region) => region.code);
}

export async function getRegions(): Promise<PlatformRegion[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/v1/regions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    return parsePlatformRegions(await res.json());
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

export type LeaderboardSortField =
  'elo' | 'wins' | 'losses' | 'games' | 'winrate' | 'lastPlayed' | 'rd';

export type LeaderboardSortDir = 'asc' | 'desc';

async function requestLeaderboard(
  region: string,
  pathname: string,
  limit: number,
  offset: number,
  minElo?: number,
  sortBy: LeaderboardSortField = 'elo',
  sortDir: LeaderboardSortDir = 'desc',
  extraParams?: Record<string, string>,
): Promise<PlatformLeaderboardResponse> {
  const empty: PlatformLeaderboardResponse = { region, total: 0, limit, offset, entries: [] };
  const base = getPlatformUrl();
  if (!base) return empty;
  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (minElo !== undefined) params.set('minElo', String(minElo));
    if (sortBy !== 'elo') params.set('sortBy', sortBy);
    if (sortDir !== 'desc') params.set('sortDir', sortDir);
    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        params.set(key, value);
      }
    }
    const url = `${base}${pathname}?${params}`;
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
        displayRating: e.elo,
        provisional: e.provisional ?? false,
      })),
    };
  } catch {
    return empty;
  }
}

export async function getLeaderboard(
  region: string,
  limit: number,
  offset = 0,
  minElo?: number,
  sortBy: LeaderboardSortField = 'elo',
  sortDir: LeaderboardSortDir = 'desc',
): Promise<PlatformLeaderboardResponse> {
  return requestLeaderboard(
    region,
    `/api/v1/regions/${encodeURIComponent(region)}/leaderboard`,
    limit,
    offset,
    minElo,
    sortBy,
    sortDir,
  );
}

export async function getClasseloLeaderboard(
  region: string,
  classId: number,
  limit: number,
  offset = 0,
  minElo?: number,
  sortBy: LeaderboardSortField = 'elo',
  sortDir: LeaderboardSortDir = 'desc',
): Promise<PlatformLeaderboardResponse> {
  return requestLeaderboard(
    region,
    `/api/v1/regions/${encodeURIComponent(region)}/classelo/leaderboard`,
    limit,
    offset,
    minElo,
    sortBy,
    sortDir,
    { class: String(classId) },
  );
}

export async function getPlayerServerStats(
  steamId: string,
  opts: { region: string; days?: StatsWindow | string; tz?: string; className?: string },
): Promise<PlayerServerStats | null> {
  const base = getPlatformUrl();
  if (!base || !opts.region) return null;
  let steam2Id: string;
  try {
    steam2Id = steamId32FromSteamId64(steamId);
  } catch {
    return null;
  }
  const params = new URLSearchParams({ region: opts.region });
  if (opts.days != null) params.set('days', String(opts.days));
  if (opts.tz) params.set('tz', opts.tz);
  if (opts.className) params.set('class', opts.className);
  try {
    const res = await fetch(
      `${base}/api/v1/players/${encodeURIComponent(steam2Id)}/server-stats?${params}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as PlayerServerStats;
  } catch {
    return null;
  }
}

export async function getPlayerChatHistory(
  steamId64: string,
  opts: { region?: string; from?: number; to?: number; cursor?: number; limit?: number },
): Promise<ProfileChatPage | null> {
  const base = getPlatformUrl();
  const secret = getPlatformAdminSecret();
  if (!base || !secret) return null;
  const steam2Id = steamId32FromSteamId64(steamId64);
  const params = new URLSearchParams();
  if (opts.region) params.set('region', opts.region);
  if (opts.from != null) params.set('from', String(opts.from));
  if (opts.to != null) params.set('to', String(opts.to));
  if (opts.cursor != null) params.set('cursor', String(opts.cursor));
  if (opts.limit != null) params.set('limit', String(opts.limit));
  try {
    const res = await fetch(
      `${base}/api/v1/admin/chat/player/${encodeURIComponent(steam2Id)}?${params}`,
      {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ProfileChatPage;
    if (!data || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

export function isPlatformInvestigateConfigured(): boolean {
  return getPlatformUrl().length > 0 && getPlatformAdminSecret().length > 0;
}

export async function investigatePlayer(query: string): Promise<InvestigateResult> {
  const base = getPlatformUrl();
  const secret = getPlatformAdminSecret();
  if (!base || !secret) {
    return { kind: 'error', message: 'Platform investigate is not configured' };
  }
  try {
    const res = await fetch(`${base}/api/v1/admin/investigate?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      if (res.status === 400) {
        const data = (await res.json().catch(() => null)) as InvestigateResult | null;
        if (data && typeof data === 'object' && 'kind' in data) return data;
        return { kind: 'invalid' };
      }
      if (res.status === 401 || res.status === 403) {
        return { kind: 'error', message: 'Platform rejected the admin secret' };
      }
      return { kind: 'error', message: 'Platform investigate request failed' };
    }
    const data = (await res.json()) as InvestigateResult;
    if (!data || typeof data !== 'object' || !('kind' in data)) {
      return { kind: 'error', message: 'Platform returned an unexpected payload' };
    }
    return data;
  } catch {
    return { kind: 'error', message: 'Could not reach the platform API' };
  }
}
