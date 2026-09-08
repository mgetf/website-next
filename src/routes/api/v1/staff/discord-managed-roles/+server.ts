/**
 * GET /api/v1/staff/discord-managed-roles
 *
 * Returns Discord role IDs that the staff hub manages.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Responses:
 *   200 { roleIds }
 *   401  Missing or invalid API key
 */

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { getManagedDiscordRoleIds } from '$lib/server/services/staff';

export const GET: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const roleIds = await getManagedDiscordRoleIds();
  return json({ roleIds });
};
