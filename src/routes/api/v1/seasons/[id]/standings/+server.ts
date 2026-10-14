import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { parseDivisionFilterQuery, pathId } from '#lib/server/api/publicLeagueQuery.js';
import { listPublicSeasonStandings } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, params, url }) =>
  publicGet(getClientAddress, () =>
    listPublicSeasonStandings(
      pathId(params.id, 'season id'),
      parseDivisionFilterQuery(url.searchParams),
    ),
  );
