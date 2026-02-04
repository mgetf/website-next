import { error, fail } from '@sveltejs/kit';
import { getPlayerProfile, unlinkDiscord } from '$lib/server/services/users';
import { withdraw1v1Entry } from '$lib/server/services/signup1v1';
import { isAdmin } from '$lib/server/auth/permissions';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { steamId } = params;

  try {
    const profile = await getPlayerProfile(steamId);

    if (!profile) {
      throw error(404, 'User not found');
    }

    // Check if user is viewing their own profile
    const isOwnProfile = locals.user?.steamId === steamId;
    const isUserAdmin = isAdmin(locals.user);

    return {
      ...profile,
      isOwnProfile,
      isAdmin: isUserAdmin,
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
  withdraw1v1: async ({ request, params, locals }) => {
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

  unlinkDiscord: async ({ params, locals }) => {
    if (!locals.user || !isAdmin(locals.user)) {
      return fail(403, { error: 'Admin access required' });
    }

    const { steamId } = params;

    try {
      await unlinkDiscord(steamId);
      return { success: true, message: 'Discord account unlinked' };
    } catch (err: any) {
      console.error('Error unlinking Discord:', err);
      return fail(400, {
        error: err.message || 'Failed to unlink Discord',
      });
    }
  },
};
