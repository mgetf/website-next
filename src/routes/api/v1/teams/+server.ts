import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { parseTeamListQuery } from '#lib/server/api/publicLeagueQuery.js';
import { listPublicTeams } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, url }) =>
  publicGet(getClientAddress, () => listPublicTeams(parseTeamListQuery(url.searchParams)));
