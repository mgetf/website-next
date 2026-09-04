import type { PageServerLoad, Actions } from './$types';
import { redirect, fail, isRedirect } from '@sveltejs/kit';
import { requireNotBanned, isBanned } from '$lib/server/auth/permissions';
import { requireFormatByCode } from '$lib/server/services/formats';
import { get1v1SignupContext, signup1v1 } from '$lib/server/services/signup1v1';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import {
  getSignupSeasonForRegion,
  getRegionsOpenForSignup,
} from '$lib/server/services/signupSeasons';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { loginToParticipateHref } from '$lib/utils/signupLogin';

// Zod schema for individual signup form
const signupSchema = z.object({
  divisionId: z.coerce.number().int().positive('Invalid division'),
  regionId: z.coerce.number().int().positive('Invalid region'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
  const format = await requireFormatByCode(params.formatCode);

  if (format.isIndividual) {
    // Individual format - handle signup directly here
    const context = await get1v1SignupContext(locals.user?.steamId ?? null, format.id);

    const [divisions, availableRegions] = await Promise.all([
      getVisibleDivisions(),
      getRegionsOpenForSignup(format.id),
    ]);

    // Determine if user can sign up and why not
    let canSignup = true;
    let disabledReason = '';

    if (locals.user && isBanned(locals.user)) {
      canSignup = false;
      disabledReason = 'Your account is suspended or banned';
    } else if (context.signupClosed) {
      canSignup = false;
      disabledReason = 'Signups are currently closed';
    } else if (context.hasActive1v1Entry) {
      canSignup = false;
      disabledReason = `You are already signed up for the ${format.name} league this season`;
    }

    if (canSignup && availableRegions.length === 0) {
      canSignup = false;
      disabledReason = `No ${format.name} seasons are currently open for signups in any region`;
    }

    return {
      format: {
        id: format.id,
        name: format.name,
        code: format.code,
        isIndividual: format.isIndividual,
        themeKey: format.themeKey,
      },
      divisions,
      regions: availableRegions,
      canSignup,
      disabledReason,
      needsLogin: !locals.user && canSignup,
      user: context.user,
    };
  } else {
    // Team format - redirect to create page
    redirect(302, `/signup/${format.code}/create`);
  }
};

export const actions: Actions = {
  signup: async ({ params, request, locals, url, getClientAddress }) => {
    if (!locals.user) {
      redirect(302, loginToParticipateHref(url.pathname));
    }
    requireNotBanned(locals.user);

    const format = await requireFormatByCode(params.formatCode);

    if (!format.isIndividual) {
      return fail(400, { error: 'Invalid signup type for this format' });
    }

    const context = await get1v1SignupContext(locals.user.steamId, format.id);

    // Check if signups are closed
    if (context.signupClosed) {
      return fail(400, { error: 'Signups are currently closed' });
    }

    // Check if already signed up
    if (context.hasActive1v1Entry) {
      return fail(400, {
        error: `You are already signed up for the ${format.name} league this season`,
      });
    }

    const formData = await request.formData();

    // Validate form data with Zod
    const validation = validateForm(formData, signupSchema);
    if (!validation.success) {
      return validationError(validation.errors, 'Invalid form data');
    }

    const { divisionId, regionId } = validation.data;

    try {
      // Get the correct season ID for the selected region
      const seasonId = await getSignupSeasonForRegion(regionId, format.id);

      if (!seasonId) {
        return fail(400, {
          error: `No active ${format.name} signup season for this region`,
        });
      }

      // Check if payment is required BEFORE signing up
      const paymentInfo = await checkPaymentRequired({
        divisionId,
        steamId: locals.user.steamId,
        seasonId,
      });

      const teamId = await signup1v1({
        ownerSteamId: locals.user.steamId,
        regionId,
        divisionId,
        formatId: format.id,
      });

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.SIGNUP,
        action: AuditAction.SIGNUP_1V1_CREATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: { divisionId, regionId, formatId: format.id, formatCode: format.code },
        ipAddress: getClientAddress(),
      });

      if (paymentInfo.required && !paymentInfo.alreadyPaid) {
        throw redirect(303, `/checkout/${locals.user.steamId}`);
      }

      throw redirect(303, `/users/${locals.user.steamId}?signup=${format.code}`);
    } catch (err) {
      if (isRedirect(err)) throw err;

      console.error(`Error signing up for ${format.name}:`, err);
      return fail(400, {
        error: getErrorMessage(err, `Failed to sign up for ${format.name} league`),
      });
    }
  },
};
