import type { RequestHandler } from './$types';
import { publicGet } from '#lib/server/api/publicGet.js';
import { parseMatchListQuery } from '#lib/server/api/publicLeagueQuery.js';
import { listPublicMatches } from '#lib/server/services/publicLeague.js';

export const GET: RequestHandler = ({ getClientAddress, url }) =>
  publicGet(getClientAddress, () => listPublicMatches(parseMatchListQuery(url.searchParams)));
