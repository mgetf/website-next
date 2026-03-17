import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireNotBanned } from '$lib/server/auth/permissions';
import {
  getUserPendingInvites,
  acceptTeamInvite,
  declineInvitation,
} from '$lib/server/services/teamJoin';
import { getEffectiveRosterLock } from '$lib/server/services/settings';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals.user);

  const pendingInvites = await getUserPendingInvites(locals.user.steamId);

  const invitations = await Promise.all(
    pendingInvites.map(async (invite) => ({
      ...invite,
      rosterLocked: await getEffectiveRosterLock(invite.teamId),
    })),
  );

  const anyRosterLocked = invitations.some((inv) => inv.rosterLocked);

  return {
    invitations,
    rosterLocked: anyRosterLocked,
  };
};

export const actions: Actions = {
  accept: async ({ request, locals }) => {
    requireNotBanned(locals.user);

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId') as string);

    if (isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    const rosterLocked = await getEffectiveRosterLock(teamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are currently locked' });
    }

    try {
      await acceptTeamInvite(locals.user.steamId, teamId);
      return { success: true, message: 'Join request submitted! An admin will review it shortly.' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to accept invitation',
      });
    }
  },

  withdraw: async ({ request, locals }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId') as string);

    if (isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    try {
      await declineInvitation(locals.user.steamId, teamId);
      return { success: true, message: 'Request withdrawn' };
    } catch (err: any) {
      return fail(400, {
        error: err.body?.message || 'Failed to withdraw request',
      });
    }
  },
};
