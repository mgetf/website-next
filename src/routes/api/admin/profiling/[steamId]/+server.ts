import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getPlayerProfiling } from '$lib/server/services/profiling';
import { isSteamId64 } from '$lib/utils/steamid';

export const GET: RequestHandler = async ({ locals, params }) => {
  requireAdmin(locals.user);

  if (!isSteamId64(params.steamId)) {
    return json({ error: 'Invalid Steam ID' }, { status: 400 });
  }

  const snapshot = await getPlayerProfiling(params.steamId);
  if (!snapshot) return json({ error: 'Profiling unavailable' }, { status: 404 });
  return json({ success: true, data: snapshot });
};

export const POST: RequestHandler = async ({ locals, params, getClientAddress }) => {
  requireAdmin(locals.user);

  if (!isSteamId64(params.steamId)) {
    return json({ error: 'Invalid Steam ID' }, { status: 400 });
  }

  const snapshot = await getPlayerProfiling(params.steamId, { refresh: true });
  if (!snapshot) return json({ error: 'Profiling unavailable' }, { status: 404 });

  await logAudit({
    actorId: locals.user.steamId,
    actorRole: locals.user.permissionLevel,
    category: AuditCategory.USER,
    action: AuditAction.PROFILING_CACHE_REFRESHED,
    targetType: 'User',
    targetId: params.steamId,
    ipAddress: getClientAddress(),
  });

  return json({ success: true, data: snapshot });
};
