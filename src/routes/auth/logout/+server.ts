/**
 * Logout Handler
 * POST /auth/logout - Clears user session
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession } from '$lib/server/session';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const POST: RequestHandler = async ({ cookies, locals, getClientAddress }) => {
  const user = locals.user;
  clearSession(cookies);

  await logAudit({
    actorId: user?.steamId,
    actorRole: user?.permissionLevel,
    category: AuditCategory.AUTH,
    action: AuditAction.AUTH_LOGOUT,
    targetType: 'User',
    targetId: user?.steamId,
    ipAddress: getClientAddress(),
  });

  throw redirect(302, '/');
};

// Also support GET for simple links
export const GET: RequestHandler = async ({ cookies, locals, getClientAddress }) => {
  const user = locals.user;
  clearSession(cookies);

  await logAudit({
    actorId: user?.steamId,
    actorRole: user?.permissionLevel,
    category: AuditCategory.AUTH,
    action: AuditAction.AUTH_LOGOUT,
    targetType: 'User',
    targetId: user?.steamId,
    ipAddress: getClientAddress(),
  });

  throw redirect(302, '/');
};
