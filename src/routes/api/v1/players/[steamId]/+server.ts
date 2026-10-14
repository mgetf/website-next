import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { pathSteamId } from '#lib/server/api/publicLeagueQuery.js';
import { getPublicPlayer } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, params }) =>
  publicGet(getClientAddress, () => getPublicPlayer(pathSteamId(params.steamId)));
