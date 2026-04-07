import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireNotBanned } from '$lib/server/auth/permissions';
import {
  validateTokenAndGetTeam,
  acceptInviteByToken,
  declineInvitation,
  hasAnyPendingRequest,
} from '$lib/server/services/teamJoin';
import {
  isSeasonCurrentlyActive,
  isTeamSeasonActive,
  getEffectiveRosterLock,
} from '$lib/server/services/settings';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

const tokenSchema = z.object({
  token: z.string().min(1, 'Invalid token'),
});

export const load: PageServerLoad = async ({ url, locals }) => {
  requireAuth(locals.user);

  const token = url.searchParams.get('token');

  if (!token) {
    throw redirect(303, '/');
  }

  try {
    const teamInfo = await validateTokenAndGetTeam(token, locals.user.steamId);

    const seasonActive = teamInfo.team?.season
      ? await isSeasonCurrentlyActive(teamInfo.team.season.id)
      : false;

    if (!seasonActive) {
      return {
        ...teamInfo,
        canJoin: false,
        error: "This team's season has ended. Joining is no longer available.",
        token,
        rosterLocked: false,
      };
    }

    const rosterLocked = teamInfo.team?.season?.rosterLocked ? seasonActive : false;

    const hasPending = teamInfo.canJoin ? await hasAnyPendingRequest(locals.user.steamId) : false;

    return {
      ...teamInfo,
      canJoin: teamInfo.canJoin && !hasPending,
      error: hasPending
        ? 'You already have a pending join request. Please wait for it to be resolved before accepting another invitation.'
        : teamInfo.error,
      token,
      rosterLocked,
    };
  } catch (err) {
    return {
      error: getErrorMessage(err, 'Invalid or expired invitation link'),
      team: null,
      activePlayers: [],
      canJoin: false,
      token: null,
      rosterLocked: false,
    };
  }
};

export const actions: Actions = {
  accept: async ({ request, locals }) => {
    requireNotBanned(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, tokenSchema);
    if (!validation.success) return validationError(validation.errors);

    const { token } = validation.data;

    // Get team ID from token to check season settings
    const { validateJoinToken: decodeToken } = await import('$lib/server/services/teamSignup');
    const { teamId } = decodeToken(token);

    const seasonActive = await isTeamSeasonActive(teamId);
    if (!seasonActive) {
      return fail(400, {
        error: "This team's season has ended. Joining is no longer available.",
      });
    }

    const rosterLocked = await getEffectiveRosterLock(teamId);
    if (rosterLocked) {
      return fail(400, { error: 'Rosters are currently locked' });
    }

    try {
      const teamId = await acceptInviteByToken(token, locals.user.steamId);
      throw redirect(303, `/teams/${teamId}?joined=awaiting-admin`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, {
        error: getErrorMessage(err, 'Failed to accept invitation'),
      });
    }
  },

  decline: async ({ request, locals }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, tokenSchema);
    if (!validation.success) return validationError(validation.errors);

    const { token } = validation.data;

    try {
      // Just decode to get team ID, then delete pending
      const { validateJoinToken } = await import('$lib/server/services/teamSignup');
      const { teamId } = validateJoinToken(token);

      await declineInvitation(locals.user.steamId, teamId);

      throw redirect(303, '/');
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, {
        error: getErrorMessage(err, 'Failed to decline invitation'),
      });
    }
  },
};
