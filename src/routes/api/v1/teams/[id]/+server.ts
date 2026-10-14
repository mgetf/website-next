import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { pathId } from '#lib/server/api/publicLeagueQuery.js';
import { getPublicTeam } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, params }) =>
  publicGet(getClientAddress, () => getPublicTeam(pathId(params.id, 'team id')));
