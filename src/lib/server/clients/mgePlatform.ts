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

export async function getRegions(): Promise<string[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/v1/regions`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.regions ?? []) as string[];
  } catch {
    return [];
  }
}

export async function getLeaderboard(
  region: string,
  limit: number,
): Promise<{ steamId: string; elo: number }[]> {
  const base = getPlatformUrl();
  if (!base) return [];
  try {
    const url = `${base}/api/v1/regions/${encodeURIComponent(region)}/leaderboard?limit=${limit}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.entries ?? []) as { steamId: string; elo: number }[];
  } catch {
    return [];
  }
}
