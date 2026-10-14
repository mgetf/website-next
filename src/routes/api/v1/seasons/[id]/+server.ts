import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { pathId } from '#lib/server/api/publicLeagueQuery.js';
import { getPublicSeason } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, params }) =>
  publicGet(getClientAddress, () => getPublicSeason(pathId(params.id, 'season id')));
