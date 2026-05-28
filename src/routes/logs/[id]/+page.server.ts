import type { PageServerLoad } from './$types';
import { getMatchLog, getRawLogUrl } from '$lib/server/services/matchLogs';
import { getRegisteredSteamIds } from '$lib/server/services/users';
import { notFound } from '$lib/server/utils/errors';
import { steamId64FromSteamId3 } from '$lib/utils/steamid';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound('Match log not found');

  const log = await getMatchLog(id);
  const rawLogUrl = getRawLogUrl(log.rawLogKey);

  // Build a map from Steam3 (used in parsed logs) → Steam64 (used in profile URLs / DB)
  const steamId3List = log.parsedData.players.map((p) => p.steamId);
  const steamId3ToSteamId64: Record<string, string> = {};
  const steamId64List: string[] = [];
  for (const id3 of steamId3List) {
    const id64 = steamId64FromSteamId3(id3);
    if (id64) {
      steamId3ToSteamId64[id3] = id64;
      steamId64List.push(id64);
    }
  }

  const registeredSteamId64s = await getRegisteredSteamIds(steamId64List);
  const registeredSet = new Set(registeredSteamId64s);

  // Only keep entries for players who actually have an mge.tf profile
  const profileSteamIds: Record<string, string> = {};
  for (const [id3, id64] of Object.entries(steamId3ToSteamId64)) {
    if (registeredSet.has(id64)) {
      profileSteamIds[id3] = id64;
    }
  }

  return {
    log: {
      id: log.id,
      mgeMatchId: log.mgeMatchId,
      hostname: log.hostname,
      map: log.map,
      arena: log.arena,
      gamemode: log.gamemode,
      format: log.format,
      aborted: log.aborted,
      durationSec: log.durationSec,
      startedAt: log.startedAt,
      endedAt: log.endedAt,
      uploadedAt: log.uploadedAt,
      rawLogUrl,
      parsedData: log.parsedData,
    },
    profileSteamIds,
  };
};
