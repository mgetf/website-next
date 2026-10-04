import { getOptionalEnv } from '$lib/server/utils/env';

const TF2_APP_ID = 440;
const STEAM_TIMEOUT_MS = 4000;

export type SteamAccountSignals = {
  steamAgeYears: number | null;
  tf2Hours: number | null;
  profilePublic: boolean | null;
};

async function steamGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(STEAM_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchSteamAccountSignals(steamId: string): Promise<SteamAccountSignals> {
  const apiKey = getOptionalEnv('STEAM_API_KEY');
  if (!apiKey) {
    return { steamAgeYears: null, tf2Hours: null, profilePublic: null };
  }

  const summary = await steamGet<{
    response?: {
      players?: {
        timecreated?: number;
        communityvisibilitystate?: number;
      }[];
    };
  }>(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamId)}`,
  );
  const player = summary?.response?.players?.[0];
  const created = player?.timecreated;
  const steamAgeYears =
    typeof created === 'number' && created > 0
      ? (Date.now() / 1000 - created) / (365.25 * 24 * 3600)
      : null;
  const visibility = player?.communityvisibilitystate;
  const profilePublic = visibility == null ? null : visibility === 3;

  const owned = await steamGet<{
    response?: { games?: { appid: number; playtime_forever?: number }[] };
  }>(
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${encodeURIComponent(steamId)}&include_played_free_games=true&include_appinfo=false`,
  );
  const games = owned?.response?.games;
  const tf2Hours = !games
    ? null
    : (games.find((game) => game.appid === TF2_APP_ID)?.playtime_forever ?? 0) / 60;

  return { steamAgeYears, tf2Hours, profilePublic };
}
