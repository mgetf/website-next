/**
 * Steam Authentication Callback
 * GET /auth/verify - Steam redirects here after authentication
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSteamAuth } from '$lib/server/auth/steam';
import { setSession, getAndClearRedirectUrl } from '$lib/server/session';
import { getPermissionLevel } from '$lib/server/auth/permissions';
import { findOrCreateSteamUser } from '$lib/server/services/users';
import { BanStatus, UserRole } from '$lib/types/user';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { authRateLimiter, checkRateLimit } from '$lib/server/utils/rateLimit';

export const GET: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  const { allowed, response } = checkRateLimit(authRateLimiter, getClientAddress());
  if (!allowed && response) return response;

  try {
    const steam = createSteamAuth(request);
    const user = await steam.authenticate(request);

    const steamUser = user._json;

    await getPermissionLevel(steamUser.steamid);

    const { username, avatar, permissionLevel, banStatus, sessionVersion, isNewUser } =
      await findOrCreateSteamUser(steamUser);

    const sessionUser = {
      steamId: steamUser.steamid,
      steamUsername: username,
      steamAvatar: avatar,
      permissionLevel: permissionLevel as unknown as UserRole,
      banStatus: banStatus as unknown as BanStatus,
      sessionVersion,
    };

    setSession(cookies, sessionUser);

    await logAudit({
      actorId: steamUser.steamid,
      actorRole: permissionLevel,
      category: AuditCategory.AUTH,
      action: AuditAction.AUTH_LOGIN,
      targetType: 'User',
      targetId: steamUser.steamid,
      metadata: { isNewUser, steamUsername: username },
      ipAddress: getClientAddress(),
    });

    const returnUrl = getAndClearRedirectUrl(cookies);
    throw redirect(302, returnUrl);
  } catch (err) {
    if (err && typeof err === 'object' && ('status' in err || 'location' in err)) {
      throw err;
    }

    console.error('Steam authentication error:', err);
    throw redirect(302, '/?error=auth_failed');
  }
};
