import { error, fail, isHttpError } from '@sveltejs/kit';
import { getErrorMessage } from '$lib/server/utils/errors';
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
import { withdraw1v1Entry, toggle1v1Ready, change1v1Status } from '$lib/server/services/signup1v1';
import { TeamStatus } from '$prisma/client.js';
import { markPlayerAsPaidManually } from '$lib/server/services/payments';
import { changeTeamDivision } from '$lib/server/services/teams';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { isAdmin } from '$lib/server/auth/permissions';
import { getSession, setSession } from '$lib/server/session';
import type { PageServerLoad, Actions } from './$types';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { getPlayerRatings } from '$lib/server/clients/mgePlatform';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const { steamId } = params;

  try {
    const [profile, ratings] = await Promise.all([
      getPlayerProfile(steamId),
      getPlayerRatings(steamId),
    ]);

    if (!profile) {
      throw error(404, 'User not found');
    }

    const isOwnProfile = locals.user?.steamId === steamId;
    const isUserAdmin = isAdmin(locals.user);
    const signupSuccess = url.searchParams.get('signup');

    // Load divisions for the admin division-change control on the active 1v1 entry
    let divisions1v1: { id: number; name: string; signupCost: number; regionId: number }[] = [];
    if (isUserAdmin && profile.current1v1Entry?.regionId) {
      const allDivisions = await getVisibleDivisions();
      divisions1v1 = allDivisions.filter((d) => d.regionId === profile.current1v1Entry!.regionId);
    }

    return {
      ...profile,
      ratings,
      isOwnProfile,
      isAdmin: isUserAdmin,
      signupSuccess,
      divisions1v1,
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
    } catch (err) {
      console.error('Error withdrawing from 1v1:', err);
      return fail(isHttpError(err) ? err.status : 500, {
        error: getErrorMessage(err, 'Failed to withdraw from 1v1 league'),
      });
    }
  },

  ready1v1: async ({ request, params, locals }) => {
    if (!locals.user) {
      return fail(401, { error: 'You must be logged in' });
    }

    const { steamId } = params;

    if (locals.user.steamId !== steamId) {
      return fail(403, { error: 'You can only ready up your own 1v1 entry' });
    }

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    try {
      await toggle1v1Ready(teamId, locals.user.steamId);
      return { success: true, message: 'Entry marked as ready! Awaiting admin approval.' };
    } catch (err) {
      return fail(isHttpError(err) ? err.status : 500, {
        error: getErrorMessage(err, 'Failed to ready up'),
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
    } catch (err) {
      console.error('Error unlinking Discord:', err);
      return fail(400, {
        error: getErrorMessage(err, 'Failed to unlink Discord'),
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
    } catch (err) {
      console.error('Error locking username:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to update username') });
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
    } catch (err) {
      console.error('Error unlocking username:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to unlock username') });
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
    } catch (err) {
      console.error('Error locking avatar:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to update avatar') });
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
    } catch (err) {
      console.error('Error unlocking avatar:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to unlock avatar') });
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
    } catch (err) {
      console.error('Error updating punishment:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to update punishment') });
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
    } catch (err) {
      console.error('Error marking 1v1 player as paid:', err);
      return fail(isHttpError(err) ? err.status : 500, {
        error: getErrorMessage(err, 'Failed to mark player as paid'),
      });
    }
  },

  change1v1Status: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');
    const newStatus = formData.get('status')?.toString();

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    const validStatuses = ['UNREADY', 'PENDING', 'READY', 'DEAD'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return fail(400, { error: 'Invalid status' });
    }

    try {
      const result = await change1v1Status(teamId, newStatus as TeamStatus);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_STATUS_CHANGED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          targetSteamId: params.steamId,
          oldStatus: result.oldStatus,
          newStatus: result.newStatus,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `Status changed to ${result.newStatus}` };
    } catch (err) {
      console.error('Error changing 1v1 status:', err);
      return fail(isHttpError(err) ? err.status : 500, {
        error: getErrorMessage(err, 'Failed to change status'),
      });
    }
  },

  change1v1Division: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');
    const divisionId = parseInt(formData.get('divisionId')?.toString() || '');

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    if (!divisionId || isNaN(divisionId) || divisionId <= 0) {
      return fail(400, { error: 'A valid division is required' });
    }

    try {
      const result = await changeTeamDivision(teamId, divisionId, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_DIVISION_CHANGED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          targetSteamId: params.steamId,
          divisionIdBefore: result.oldDivision?.id ?? null,
          divisionNameBefore: result.oldDivision?.name ?? null,
          divisionIdAfter: result.newDivision.id,
          divisionNameAfter: result.newDivision.name,
          paymentStatusReset: result.paymentStatusReset,
          notifiedPlayers: result.notifiedPlayerSteamIds,
        },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: `Division changed to ${result.newDivision.name}` };
    } catch (err) {
      console.error('Error changing 1v1 division:', err);
      return fail(isHttpError(err) ? err.status : 500, {
        error: getErrorMessage(err, 'Failed to change division'),
      });
    }
  },
};
