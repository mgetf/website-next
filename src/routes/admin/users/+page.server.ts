import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { fail } from '@sveltejs/kit';
import {
  getUsers,
  countUsers,
  updateUser,
  banUser,
  getUserBySteamId,
  unlinkDiscord,
  clearPunishment,
  lockUserName,
  unlockUserName,
  lockUserAvatar,
  unlockUserAvatar,
} from '$lib/server/services/users';
import { getDivisions } from '$lib/server/services/divisions';
import { getRegions } from '$lib/server/services/regions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  // Parse query parameters
  const page = parseInt(url.searchParams.get('page') || '1');
  const pageSize = parseInt(url.searchParams.get('pageSize') || '20');
  const search = url.searchParams.get('search') || '';
  const permissionLevelFilter = url.searchParams.get('permissionLevel');
  const banStatusFilter = url.searchParams.get('banStatus');

  // Get total count for pagination
  const totalUsers = await countUsers({
    search,
    permissionLevel: permissionLevelFilter || undefined,
    banStatus: banStatusFilter || undefined,
  });

  // Fetch users with pagination, divisions and regions for staff assignment
  const [users, divisions, regions] = await Promise.all([
    getUsers({
      search,
      permissionLevel: permissionLevelFilter || undefined,
      banStatus: banStatusFilter || undefined,
      page,
      pageSize,
    }),
    getDivisions(),
    getRegions(),
  ]);

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    users: users.map((user) => ({
      steamId: user.steamId,
      steamUsername: user.steamUsername,
      steamAvatar: user.steamAvatar,
      permissionLevel: user.permissionLevel,
      banStatus: user.banStatus,
      nameOverride: user.nameOverride,
      discordLinked: !!user.discord,
      discordUsername: user.discord?.discordUsername,
      staffDivisionId: user.staffDivisionId,
      staffDivisionName: user.staffDivision?.name,
      staffRegionId: user.staffDivision?.regionId,
    })),
    regions: regions.map((r) => ({
      id: r.id,
      name: r.name,
    })),
    divisions: divisions.map((d) => ({
      id: d.id,
      name: d.name,
      regionId: d.regionId,
      regionName: d.region?.name,
    })),
    pagination: {
      page,
      pageSize,
      totalUsers,
      totalPages: Math.ceil(totalUsers / pageSize),
    },
    filters: {
      search,
      permissionLevel: permissionLevelFilter || '',
      banStatus: banStatusFilter || '',
    },
  };
};

export const actions: Actions = {
  updateUser: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const permissionLevel = formData.get('permissionLevel') as string;
    const banStatus = formData.get('banStatus') as string;
    const nameOverride = formData.get('nameOverride') as string;
    const staffDivisionId = formData.get('staffDivisionId') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    if (permissionLevel) {
      requireStrictAdmin(locals.user);
    }

    try {
      await updateUser(steamId, {
        permissionLevel: permissionLevel || undefined,
        banStatus: banStatus || undefined,
        nameOverride: nameOverride ? parseInt(nameOverride) : undefined,
        staffDivisionId:
          staffDivisionId === '' ? null : staffDivisionId ? parseInt(staffDivisionId) : undefined,
      });

      if (permissionLevel) {
        await logAudit({
          actorId: locals.user?.steamId,
          actorRole: locals.user?.permissionLevel,
          category: AuditCategory.USER,
          action: AuditAction.USER_ROLE_CHANGED,
          targetType: 'User',
          targetId: steamId,
          metadata: { newRole: permissionLevel },
          ipAddress: getClientAddress(),
        });
      }

      return { success: true, message: 'User updated successfully!' };
    } catch (error) {
      console.error('Error updating user:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update user',
      });
    }
  },

  banUser: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    if (!locals.user) {
      return fail(401, { error: 'Unauthorized' });
    }

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const severity = formData.get('severity') as 'WARNING' | 'SUSPENDED' | 'BANNED';
    const reason = formData.get('reason') as string;
    const duration = formData.get('duration') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }
    if (!severity) {
      return fail(400, { error: 'Severity is required' });
    }
    if (!reason || reason.trim().length === 0) {
      return fail(400, { error: 'Reason is required' });
    }

    const targetUser = await getUserBySteamId(steamId);
    if (
      targetUser &&
      (targetUser.permissionLevel === 'MODERATOR' || targetUser.permissionLevel === 'ADMIN')
    ) {
      requireStrictAdmin(locals.user);
    }

    try {
      await banUser(
        steamId,
        locals.user.steamId,
        severity,
        reason,
        duration ? parseInt(duration) : undefined,
      );

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_BANNED,
        targetType: 'User',
        targetId: steamId,
        metadata: { severity, reason, duration: duration ? parseInt(duration) : null },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        message: `User ${severity.toLowerCase()} successfully!`,
      };
    } catch (error) {
      console.error('Error banning user:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to ban user',
      });
    }
  },

  clearPunishment: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    if (!locals.user) {
      return fail(401, { error: 'Unauthorized' });
    }

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    try {
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

      return { success: true, message: 'Punishment cleared successfully!' };
    } catch (error) {
      console.error('Error clearing punishment:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to clear punishment',
      });
    }
  },

  lockUserName: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const newName = formData.get('newName') as string;

    if (!steamId || !newName) {
      return fail(400, { error: 'Steam ID and name are required' });
    }

    try {
      await lockUserName(steamId, newName);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_NAME_LOCKED,
        targetType: 'User',
        targetId: steamId,
        metadata: { newName },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Name locked successfully!' };
    } catch (error) {
      console.error('Error locking user name:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to lock name',
      });
    }
  },

  unlockUserName: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    try {
      await unlockUserName(steamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_NAME_UNLOCKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Name unlocked successfully!' };
    } catch (error) {
      console.error('Error unlocking user name:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to unlock name',
      });
    }
  },

  lockUserAvatar: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const avatarUrl = formData.get('avatarUrl') as string;

    if (!steamId || !avatarUrl) {
      return fail(400, { error: 'Steam ID and avatar URL are required' });
    }

    try {
      await lockUserAvatar(steamId, avatarUrl);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_AVATAR_LOCKED,
        targetType: 'User',
        targetId: steamId,
        metadata: { avatarUrl },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Avatar locked successfully!' };
    } catch (error) {
      console.error('Error locking user avatar:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to lock avatar',
      });
    }
  },

  unlockUserAvatar: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    try {
      await unlockUserAvatar(steamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_AVATAR_UNLOCKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Avatar unlocked successfully!' };
    } catch (error) {
      console.error('Error unlocking user avatar:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to unlock avatar',
      });
    }
  },

  unlinkDiscord: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;

    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    try {
      await unlinkDiscord(steamId);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.USER,
        action: AuditAction.USER_DISCORD_UNLINKED,
        targetType: 'User',
        targetId: steamId,
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Discord account unlinked' };
    } catch (error) {
      console.error('Error unlinking Discord:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to unlink Discord',
      });
    }
  },
};
