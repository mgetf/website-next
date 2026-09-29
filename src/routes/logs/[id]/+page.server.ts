import type { PageServerLoad } from './$types';
import { getMatchLog, getRawLogUrl } from '$lib/server/services/matchLogs';
import { notFound } from '$lib/server/utils/errors';
import { steamId64FromSteamId3 } from '$lib/utils/steamid';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound('Match log not found');

  const log = await getMatchLog(id);
  const rawLogUrl = getRawLogUrl(log.rawLogKey);

  const profileSteamIds: Record<string, string> = {};
  for (const player of log.parsedData.players) {
    const id64 = steamId64FromSteamId3(player.steamId);
    if (id64) profileSteamIds[player.steamId] = id64;
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
