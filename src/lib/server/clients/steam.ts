import { getOptionalEnv } from '$lib/server/utils/env';

const TF2_APP_ID = 440;
const STEAM_TIMEOUT_MS = 4000;

export type SteamAccountSignals = {
  steamAgeYears: number | null;
  steamCreatedAt: string | null;
  steamLevel: number | null;
  gameCount: number | null;
  tf2Hours: number | null;
  profilePublic: boolean | null;
};

const EMPTY_STEAM: SteamAccountSignals = {
  steamAgeYears: null,
  steamCreatedAt: null,
  steamLevel: null,
  gameCount: null,
  tf2Hours: null,
  profilePublic: null,
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
  if (!apiKey) return { ...EMPTY_STEAM };

  const key = encodeURIComponent(apiKey);
  const id = encodeURIComponent(steamId);

  const [summary, owned, level] = await Promise.all([
    steamGet<{
      response?: {
        players?: {
          timecreated?: number;
          communityvisibilitystate?: number;
        }[];
      };
    }>(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${id}`),
    steamGet<{
      response?: { game_count?: number; games?: { appid: number; playtime_forever?: number }[] };
    }>(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${id}&include_played_free_games=true&include_appinfo=false`,
    ),
    steamGet<{ response?: { player_level?: number } }>(
      `https://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${key}&steamid=${id}`,
    ),
  ]);

  const player = summary?.response?.players?.[0];
  const created = player?.timecreated;
  const steamCreatedAt =
    typeof created === 'number' && created > 0 ? new Date(created * 1000).toISOString() : null;
  const steamAgeYears =
    typeof created === 'number' && created > 0
      ? (Date.now() / 1000 - created) / (365.25 * 24 * 3600)
      : null;
  const visibility = player?.communityvisibilitystate;
  const profilePublic = visibility == null ? null : visibility === 3;

  const games = owned?.response?.games;
  const reportedCount = owned?.response?.game_count;
  const gameCount =
    typeof reportedCount === 'number' && Number.isFinite(reportedCount)
      ? reportedCount
      : Array.isArray(games)
        ? games.length
        : null;
  const tf2Hours = !games
    ? null
    : (games.find((game) => game.appid === TF2_APP_ID)?.playtime_forever ?? 0) / 60;

  const playerLevel = level?.response?.player_level;
  const steamLevel =
    typeof playerLevel === 'number' && Number.isFinite(playerLevel) ? playerLevel : null;

  return { steamAgeYears, steamCreatedAt, steamLevel, gameCount, tf2Hours, profilePublic };
}
