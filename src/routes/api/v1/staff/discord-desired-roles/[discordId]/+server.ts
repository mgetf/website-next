/**
 * GET /api/v1/staff/discord-desired-roles/:discordId
 *
 * Hub-managed Discord role IDs this Discord user should have.
 * Empty when the account is unlinked or not designated staff.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Responses:
 *   200 { roleIds }
 *   401  Missing or invalid API key
 */

import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { getDesiredDiscordRoleIdsByDiscordId } from '#lib/server/services/staff.js';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { discordId } = params;
  if (!discordId) {
    return Response.json({ error: 'Missing discordId' }, { status: 400 });
  }

  const roleIds = await getDesiredDiscordRoleIdsByDiscordId(discordId);
  return Response.json({ roleIds });
};
