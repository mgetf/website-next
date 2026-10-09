/**
 * GET /api/v1/discord/:discordId
 *
 * Returns the mge.tf account linked to a given Discord user ID.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Responses:
 *   200 { steamId, steamUsername, discordUsername }
 *   401  Missing or invalid API key
 *   404  Discord account not linked
 */

import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { getUserByDiscordId } from '#lib/server/services/users.js';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { discordId } = params;

  if (!discordId) {
    return Response.json({ error: 'Missing discordId' }, { status: 400 });
  }

  const record = await getUserByDiscordId(discordId);

  if (!record || !record.player) {
    return Response.json(
      { error: 'No mge.tf account linked to this Discord user' },
      { status: 404 },
    );
  }

  return Response.json({
    steamId: record.player.steamId,
    steamUsername: record.player.steamUsername,
    discordUsername: record.discordUsername,
  });
};
