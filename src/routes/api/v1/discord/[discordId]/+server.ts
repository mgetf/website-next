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
import { json } from '@sveltejs/kit';
import { requireApiKey } from '$lib/server/auth/apiKey';
import { getUserByDiscordId } from '$lib/server/services/users';

export const GET: RequestHandler = async ({ params, request }) => {
  await requireApiKey(request);

  const { discordId } = params;

  if (!discordId) {
    return json({ error: 'Missing discordId' }, { status: 400 });
  }

  const record = await getUserByDiscordId(discordId);

  if (!record || !record.player) {
    return json({ error: 'No mge.tf account linked to this Discord user' }, { status: 404 });
  }

  return json({
    steamId: record.player.steamId,
    steamUsername: record.player.steamUsername,
    discordUsername: record.discordUsername,
  });
};
