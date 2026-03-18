import { error, fail } from '@sveltejs/kit';
import {
  getPlayerProfile,
  unlinkDiscord,
  lockUserName,
  unlockUserName,
  lockUserAvatar,
  unlockUserAvatar,
  banUser,
  clearPunishment,
} from '$lib/server/services/users';
import { withdraw1v1Entry } from '$lib/server/services/signup1v1';
import { markPlayerAsPaidManually } from '$lib/server/services/payments';
import { isAdmin } from '$lib/server/auth/permissions';
import { getSession, setSession } from '$lib/server/session';
import type { PageServerLoad, Actions } from './$types';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const { steamId } = params;

  try {
    const profile = await getPlayerProfile(steamId);

    if (!profile) {
      throw error(404, 'User not found');
    }

    const isOwnProfile = locals.user?.steamId === steamId;
    const isUserAdmin = isAdmin(locals.user);
    const signupSuccess = url.searchParams.get('signup');

    return {
      ...profile,
      isOwnProfile,
      isAdmin: isUserAdmin,
      signupSuccess,
    };
  } catch (err) {
    console.error('Error loading user profile:', err);

    // If it's already a SvelteKit error, rethrow it
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    // Otherwise, wrap it in a 500 error
    throw error(500, 'Failed to load user profile');
  }
};

export const actions: Actions = {
  withdraw1v1: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const { steamId } = params;

    // Only allow withdrawing from own profile (or admin from any profile)
    const isGlobalAdmin = isAdmin(locals.user);
    if (locals.user.steamId !== steamId && !isGlobalAdmin) {
      return fail(403, {
        error: 'You can only withdraw from your own 1v1 entry',
      });
    }
    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    try {
      await withdraw1v1Entry(teamId, locals.user.steamId, isGlobalAdmin);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SIGNUP,
        action: AuditAction.SIGNUP_1V1_WITHDRAWN,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { targetSteamId: steamId },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        message: 'Successfully withdrawn from 1v1 league',
      };
    } catch (err: any) {
      console.error('Error withdrawing from 1v1:', err);
      return fail(err.status || 500, {
        error: err.body?.message || 'Failed to withdraw from 1v1 league',
      });
    }
  },

  unlinkDiscord: async ({ params, locals, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;

    try {
      await unlinkDiscord(steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_DISCORD_UNLINKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Discord account unlinked' };
    } catch (err: any) {
      console.error('Error unlinking Discord:', err);
      return fail(400, {
        error: err.message || 'Failed to unlink Discord',
      });
    }
  },

  lockName: async ({ request, params, locals, cookies, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;
    const formData = await request.formData();
    const newName = formData.get('name')?.toString() || '';

    try {
      const updated = await lockUserName(steamId, newName);

      if (locals.user.steamId === steamId) {
        const session = getSession(cookies);
        if (session) {
          setSession(cookies, { ...session, steamUsername: updated.steamUsername });
        }
      }

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_NAME_LOCKED,
        targetType: 'User',
        targetId: steamId,
        metadata: { newName },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Name set and locked' };
    } catch (err: any) {
      console.error('Error locking username:', err);
      return fail(400, { error: err.message || 'Failed to update username' });
    }
  },

  unlockName: async ({ params, locals, cookies, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;

    try {
      const updated = await unlockUserName(steamId);

      if (locals.user.steamId === steamId) {
        const session = getSession(cookies);
        if (session) {
          setSession(cookies, {
            ...session,
            steamUsername: updated.steamUsername,
            steamAvatar: updated.steamAvatar ?? session.steamAvatar,
          });
        }
      }

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_NAME_UNLOCKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `Name unlocked — synced to "${updated.steamUsername}"` };
    } catch (err: any) {
      console.error('Error unlocking username:', err);
      return fail(400, { error: err.message || 'Failed to unlock username' });
    }
  },

  lockAvatar: async ({ request, params, locals, cookies, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;
    const formData = await request.formData();
    const avatarUrl = formData.get('avatarUrl')?.toString() || '';

    try {
      const updated = await lockUserAvatar(steamId, avatarUrl);

      if (locals.user.steamId === steamId) {
        const session = getSession(cookies);
        if (session) {
          setSession(cookies, {
            ...session,
            steamAvatar: updated.steamAvatar ?? session.steamAvatar,
          });
        }
      }

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_AVATAR_LOCKED,
        targetType: 'User',
        targetId: steamId,
        metadata: { avatarUrl },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Avatar set and locked' };
    } catch (err: any) {
      console.error('Error locking avatar:', err);
      return fail(400, { error: err.message || 'Failed to update avatar' });
    }
  },

  unlockAvatar: async ({ params, locals, cookies, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;

    try {
      const updated = await unlockUserAvatar(steamId);

      if (locals.user.steamId === steamId) {
        const session = getSession(cookies);
        if (session) {
          setSession(cookies, {
            ...session,
            steamAvatar: updated.steamAvatar ?? session.steamAvatar,
          });
        }
      }

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_AVATAR_UNLOCKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Avatar unlocked — synced from Steam' };
    } catch (err: any) {
      console.error('Error unlocking avatar:', err);
      return fail(400, { error: err.message || 'Failed to unlock avatar' });
    }
  },

  punishUser: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;
    const formData = await request.formData();
    const severity = formData.get('severity')?.toString();

    if (!severity || !['NONE', 'WARNING', 'SUSPENDED', 'BANNED'].includes(severity)) {
      return fail(400, { error: 'Invalid severity' });
    }

    try {
      if (severity === 'NONE') {
        await clearPunishment(steamId, locals.user.steamId);

        await logAudit({
          actorId: locals.user.steamId,
          actorRole: locals.user.permissionLevel,
          category: AuditCategory.USER,
          action: AuditAction.USER_UNBANNED,
          targetType: 'User',
          targetId: steamId,
          ipAddress: getClientAddress(),
        });

        return { success: true, message: 'Punishment cleared' };
      }

      const reason = formData.get('reason')?.toString() || '';
      const durationStr = formData.get('duration')?.toString();
      const duration = durationStr ? parseInt(durationStr) : undefined;

      if (!reason.trim()) {
        return fail(400, { error: 'Reason is required' });
      }

      await banUser(
        steamId,
        locals.user.steamId,
        severity as 'WARNING' | 'SUSPENDED' | 'BANNED',
        reason,
        duration,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_BANNED,
        targetType: 'User',
        targetId: steamId,
        metadata: { severity, reason, duration: duration ?? null },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `User punished: ${severity}` };
    } catch (err: any) {
      console.error('Error updating punishment:', err);
      return fail(400, { error: err.message || 'Failed to update punishment' });
    }
  },

  mark1v1Paid: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;
    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    try {
      await markPlayerAsPaidManually(steamId, teamId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.PAYMENT_MARKED_MANUALLY,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { targetSteamId: steamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Player marked as paid' };
    } catch (err: any) {
      console.error('Error marking 1v1 player as paid:', err);
      return fail(err.status || 500, {
        error: err.body?.message || err.message || 'Failed to mark player as paid',
      });
    }
  },
};
