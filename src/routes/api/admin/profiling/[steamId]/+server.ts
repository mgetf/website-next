import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getPlayerProfiling } from '$lib/server/services/profiling';
import { isSteamId64 } from '$lib/utils/steamid';

export const GET: RequestHandler = async ({ locals, params }) => {
  requireAdmin(locals.user);

  if (!isSteamId64(params.steamId)) {
    return json({ error: 'Invalid Steam ID' }, { status: 400 });
  }

  const scores = await getPlayerProfiling(params.steamId);
  if (!scores) return json({ error: 'Profiling unavailable' }, { status: 404 });
  return json({ success: true, data: scores });
};
