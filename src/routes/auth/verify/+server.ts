/**
 * Steam Authentication Callback
 * GET /auth/verify - Steam redirects here after authentication
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSteamAuth } from '$lib/server/auth/steam';
import { setSession, getAndClearRedirectUrl } from '$lib/server/session';
import { prisma } from '$lib/server/db';
import { getPermissionLevel } from '$lib/server/auth/permissions';
import { UserRole as PrismaUserRole } from '$prisma/client.js';
import { BanStatus, UserRole } from '$lib/types/user';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const GET: RequestHandler = async ({ cookies, request, getClientAddress }) => {
  try {
    // Create Steam auth instance and authenticate
    const steam = createSteamAuth(request);
    const user = await steam.authenticate(request);

    // Extract Steam user data
    const steamUser = user._json as any;

    // Get user's permission level from database
    const permissionLevel = await getPermissionLevel(steamUser.steamid);

    // Check if user exists in database
    const existingUser = await prisma.user.findUnique({
      where: { steamId: steamUser.steamid },
      select: {
        steamId: true,
        steamUsername: true,
        steamAvatar: true,
        permissionLevel: true,
        banStatus: true,
        nameOverride: true,
        avatarOverride: true,
      },
    });

    let finalUsername: string;
    let finalAvatar: string;
    let finalPermission: UserRole;
    let finalBanStatus: BanStatus;

    if (!existingUser) {
      // Create new user
      await prisma.user.create({
        data: {
          steamId: steamUser.steamid,
          steamUsername: steamUser.personaname,
          steamAvatar: steamUser.avatarfull,
          permissionLevel: PrismaUserRole.GUEST,
        },
      });
      finalUsername = steamUser.personaname;
      finalAvatar = steamUser.avatarfull;
      finalPermission = UserRole.GUEST;
      finalBanStatus = BanStatus.NONE;
    } else {
      finalUsername = existingUser.nameOverride
        ? existingUser.steamUsername
        : steamUser.personaname;

      finalAvatar = existingUser.avatarOverride
        ? (existingUser.steamAvatar ?? steamUser.avatarfull)
        : steamUser.avatarfull;

      const updateData: Record<string, string> = {};
      if (!existingUser.nameOverride && existingUser.steamUsername !== finalUsername) {
        updateData.steamUsername = finalUsername;
      }
      if (!existingUser.avatarOverride && existingUser.steamAvatar !== finalAvatar) {
        updateData.steamAvatar = finalAvatar;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({
          where: { steamId: steamUser.steamid },
          data: updateData,
        });
      }

      finalPermission =
        existingUser.permissionLevel as unknown as UserRole;
      finalBanStatus =
        existingUser.banStatus as unknown as BanStatus;
    }

    // Create session using the resolved final values
    const sessionUser = {
      steamId: steamUser.steamid,
      steamUsername: finalUsername,
      steamAvatar: finalAvatar,
      permissionLevel: finalPermission,
      banStatus: finalBanStatus,
    };

    setSession(cookies, sessionUser);

    await logAudit({
      actorId: steamUser.steamid,
      actorRole: finalPermission,
      category: AuditCategory.AUTH,
      action: AuditAction.AUTH_LOGIN,
      targetType: 'User',
      targetId: steamUser.steamid,
      metadata: { isNewUser: !existingUser, steamUsername: finalUsername },
      ipAddress: getClientAddress(),
    });

    // Redirect to original page or home
    const returnUrl = getAndClearRedirectUrl(cookies);
    throw redirect(302, returnUrl);
  } catch (err) {
    console.error('Steam authentication error:', err);

    // If it's already a redirect or error, rethrow it
    if (
      err &&
      typeof err === 'object' &&
      ('status' in err || 'location' in err)
    ) {
      throw err;
    }

    // Otherwise redirect to home with error
    throw redirect(302, '/?error=auth_failed');
  }
};
