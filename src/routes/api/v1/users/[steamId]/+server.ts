/**
 * GET /api/v1/users/:steamId
 *
 * Returns the mge.tf account for a given Steam ID, including linked Discord info.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Responses:
 *   200 { steamId, steamUsername, discordId, discordUsername }
 *   401  Missing or invalid API key
 *   404  User not found
 */

import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { getUserBySteamId } from '#lib/server/services/users.js';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { steamId } = params;

  if (!steamId) {
    return Response.json({ error: 'Missing steamId' }, { status: 400 });
  }

  const user = await getUserBySteamId(steamId);

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({
    steamId: user.steamId,
    steamUsername: user.steamUsername,
    discordId: user.discord?.discordId ?? null,
    discordUsername: user.discord?.discordUsername ?? null,
  });
};
