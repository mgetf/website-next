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
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { getDesiredDiscordRoleIdsByDiscordId } from '$lib/server/services/staff';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { discordId } = params;
  if (!discordId) {
    return json({ error: 'Missing discordId' }, { status: 400 });
  }

  const roleIds = await getDesiredDiscordRoleIdsByDiscordId(discordId);
  return json({ roleIds });
};
