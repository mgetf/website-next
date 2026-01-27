import type { PageServerLoad, Actions } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import {
  getSignupContext,
  reregisterTeam,
} from '$lib/server/services/teamSignup';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import { getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  requireAuth(locals.user);

  const context = await getSignupContext(locals.user.steamId);

  // Load divisions and regions
  const [divisions, regions] = await Promise.all([
    getVisibleDivisions(),
    getVisibleRegions(),
  ]);

  // Determine if user can re-register and why not
  let canReregister = true;
  let disabledReason = '';

  if (context.signupClosed) {
    canReregister = false;
    disabledReason = 'Team signups are currently closed';
  } else if (context.ownedTeams.length === 0) {
    canReregister = false;
    disabledReason = 'You have no teams available to re-register';
  } else if (context.rosterLocked) {
    canReregister = false;
    disabledReason = 'Rosters are currently locked';
  } else if (context.hasActiveTeam) {
    canReregister = false;
    disabledReason = 'You are already in an active 2v2 team';
  }

  return {
    ownedTeams: context.ownedTeams,
    divisions,
    regions,
    canReregister,
    disabledReason,
  };
};

export const actions: Actions = {
  reregisterTeam: async ({ request, locals }) => {
    requireAuth(locals.user);

    const context = await getSignupContext(locals.user.steamId);

    // Check if signups are closed
    if (context.signupClosed) {
      return fail(400, { error: 'Signups are currently closed' });
    }

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId') as string);
    const divisionId = parseInt(formData.get('divisionId') as string);
    const regionId = parseInt(formData.get('regionId') as string);

    // Validate required fields
    if (!teamId || !divisionId || !regionId) {
      return fail(400, { error: 'All fields are required' });
    }

    try {
      // Get the correct season ID for the selected region
      const seasonId = await getSignupSeasonForRegion(regionId, FORMAT_2V2);

      // Check if payment is required BEFORE re-registering
      const paymentInfo = await checkPaymentRequired({
        divisionId,
        steamId: locals.user.steamId,
        seasonId: seasonId ?? undefined,
      });

      // Re-register team
      await reregisterTeam({
        teamId,
        divisionId,
        regionId,
        ownerSteamId: locals.user.steamId,
      });

      if (paymentInfo.required && !paymentInfo.alreadyPaid) {
        // Redirect to checkout
        throw redirect(303, `/checkout/${locals.user.steamId}`);
      }

      // Redirect to team page
      throw redirect(303, `/teams/${teamId}`);
    } catch (err: any) {
      // If it's a redirect, let it through
      if (err.status === 303) {
        throw err;
      }

      console.error('Error re-registering team:', err);
      return fail(400, {
        error: err.body?.message || 'Failed to re-register team',
      });
    }
  },
};
