import type { PageServerLoad } from './$types';
import { getMatchLog, getRawLogUrl } from '$lib/server/services/matchLogs';
import { notFound } from '$lib/server/utils/errors';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) notFound('Match log not found');

  const log = await getMatchLog(id);
  const rawLogUrl = getRawLogUrl(log.rawLogKey);

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
  };
};
