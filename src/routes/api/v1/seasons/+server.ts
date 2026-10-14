import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { parseSeasonListQuery } from '#lib/server/api/publicLeagueQuery.js';
import { listPublicSeasons } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, url }) =>
  publicGet(getClientAddress, () => listPublicSeasons(parseSeasonListQuery(url.searchParams)));
