import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { fail } from '@sveltejs/kit';
import {
  getUsers,
  countUsers,
  updateUser,
  banUser,
} from '$lib/server/services/users';

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

  // Fetch users with pagination
  const users = await getUsers({
    search,
    permissionLevel: permissionLevelFilter || undefined,
    banStatus: banStatusFilter || undefined,
    page,
    pageSize,
  });

  return {
    users: users.map((user) => ({
      steamId: user.steamId,
      steamUsername: user.steamUsername,
      steamAvatar: user.steamAvatar,
      permissionLevel: user.permissionLevel,
      banStatus: user.banStatus,
      nameOverride: user.nameOverride,
      discordLinked: !!user.discord,
      discordUsername: user.discord?.discordUsername,
      isModerator: !!user.moderator,
      moderatorDivision: user.moderator?.division?.name,
    })),
    pagination: {
      page,
      pageSize,
      totalUsers,
      totalPages: Math.ceil(totalUsers / pageSize),
    },
    filters: {
      search,
      permissionLevel: permissionLevelFilter || 'all',
      banStatus: banStatusFilter || 'all',
    },
  };
};

export const actions: Actions = {
  updateUser: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const permissionLevel = formData.get('permissionLevel') as string;
    const banStatus = formData.get('banStatus') as string;
    const nameOverride = formData.get('nameOverride') as string;

    // Validate inputs
    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }

    try {
      await updateUser(steamId, {
        permissionLevel: permissionLevel || undefined,
        banStatus: banStatus || undefined,
        nameOverride: nameOverride ? parseInt(nameOverride) : undefined,
      });

      return { success: true, message: 'User updated successfully!' };
    } catch (error) {
      console.error('Error updating user:', error);
      return fail(400, {
        error: error instanceof Error ? error.message : 'Failed to update user',
      });
    }
  },

  banUser: async ({ request, locals }) => {
    requireAdmin(locals.user);

    if (!locals.user) {
      return fail(401, { error: 'Unauthorized' });
    }

    const formData = await request.formData();
    const steamId = formData.get('steamId') as string;
    const severity = formData.get('severity') as
      | 'WARNING'
      | 'SUSPENDED'
      | 'BANNED';
    const reason = formData.get('reason') as string;
    const duration = formData.get('duration') as string;

    // Validate inputs
    if (!steamId) {
      return fail(400, { error: 'Invalid user ID' });
    }
    if (!severity) {
      return fail(400, { error: 'Severity is required' });
    }
    if (!reason || reason.trim().length === 0) {
      return fail(400, { error: 'Reason is required' });
    }

    try {
      await banUser(
        steamId,
        locals.user.steamId,
        severity,
        reason,
        duration ? parseInt(duration) : undefined,
      );

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
};
