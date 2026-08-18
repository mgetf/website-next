import type { PageServerLoad, Actions } from './$types';
import {
  requireAdmin,
  requireStrictAdmin,
  requireCanModerateUser,
  isStrictAdmin,
} from '$lib/server/auth/permissions';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { formError, validateForm, validationError } from '$lib/server/utils/forms';
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
import { getFormatsForFilter } from '$lib/server/services/formats';
import {
  getRegionIdsByFormat,
  mapStaffAssignmentForDisplay,
  parseStaffAssignmentTokens,
} from '$lib/server/services/staffAssignments';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const steamIdSchema = z.object({
  steamId: z.string().min(1, 'Invalid user ID'),
});

const updateUserSchema = z.object({
  steamId: z.string().min(1, 'Invalid user ID'),
  permissionLevel: z.enum(['', 'GUEST', 'MODERATOR', 'ADMIN']).optional().default(''),
  banStatus: z.enum(['', 'NONE', 'WARNING', 'SUSPENDED', 'BANNED']).optional().default(''),
  nameOverride: z.string().optional().default(''),
  staffAssignments: z.array(z.string()).optional().default([]),
});

const banUserSchema = z.object({
  steamId: z.string().min(1, 'Invalid user ID'),
  severity: z.enum(['WARNING', 'SUSPENDED', 'BANNED'], { message: 'Severity is required' }),
  reason: z.string().min(1, 'Reason is required'),
  duration: z.string().optional().default(''),
});

const lockUserNameSchema = z.object({
  steamId: z.string().min(1, 'Steam ID is required'),
  newName: z.string().min(1, 'Name is required'),
});

const lockUserAvatarSchema = z.object({
  steamId: z.string().min(1, 'Steam ID is required'),
  avatarUrl: z.string().min(1, 'Avatar URL is required'),
});

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

  // Fetch users with pagination, divisions, regions and formats for staff assignment
  const [users, divisions, regions, formats, regionIdsByFormat] = await Promise.all([
    getUsers({
      search,
      permissionLevel: permissionLevelFilter || undefined,
      banStatus: banStatusFilter || undefined,
      page,
      pageSize,
    }),
    getDivisions(),
    getRegions(),
    getFormatsForFilter(),
    getRegionIdsByFormat(),
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
      staffAssignments: user.staffAssignments.map(mapStaffAssignmentForDisplay),
    })),
    regions: regions.map((r) => ({
      id: r.id,
      name: r.name,
    })),
    formats: formats.map((f) => ({
      id: f.id,
      name: f.name,
      themeKey: f.themeKey,
    })),
    regionIdsByFormat,
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
    const validation = validateForm(formData, updateUserSchema, ['staffAssignments']);
    if (!validation.success) return validationError(validation.errors);

    const { steamId, permissionLevel, banStatus, nameOverride, staffAssignments } = validation.data;

    if (permissionLevel) {
      requireStrictAdmin(locals.user);
    }

    // Ban status changes (including clearing via NONE) require the same
    // staff-protection rules as the dedicated ban/clear actions.
    if (banStatus) {
      const targetUser = await getUserBySteamId(steamId);
      requireCanModerateUser(locals.user, targetUser?.permissionLevel ?? 'GUEST');
      if (banStatus === 'NONE') {
        requireStrictAdmin(locals.user);
      }
    }

    try {
      const parsedAssignments = parseStaffAssignmentTokens(staffAssignments);

      await updateUser(steamId, {
        permissionLevel: permissionLevel || undefined,
        banStatus: banStatus || undefined,
        nameOverride: nameOverride ? parseInt(nameOverride) : undefined,
        staffAssignments: parsedAssignments,
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
      return formError(getErrorMessage(error, 'Failed to update user'), 400);
    }
  },

  banUser: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, banUserSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId, severity, reason, duration } = validation.data;

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

    const formData = await request.formData();
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId } = validation.data;

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
    const validation = validateForm(formData, lockUserNameSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId, newName } = validation.data;

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
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId } = validation.data;

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
    const validation = validateForm(formData, lockUserAvatarSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId, avatarUrl } = validation.data;

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
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId } = validation.data;

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
    const validation = validateForm(formData, steamIdSchema);
    if (!validation.success) return validationError(validation.errors);

    const { steamId } = validation.data;

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
