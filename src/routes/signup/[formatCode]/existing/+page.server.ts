import type { PageServerLoad, Actions } from './$types';
import { requireNotBanned, isBanned } from '$lib/server/auth/permissions';
import { requireFormatByCode } from '$lib/server/services/formats';
import { getSignupContext, reregisterTeam } from '$lib/server/services/teamSignup';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import {
  getSignupSeasonForRegion,
  getRegionsOpenForSignup,
} from '$lib/server/services/signupSeasons';
import { getTeamAuditSnapshot } from '$lib/server/services/teams';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { loginToParticipateHref } from '$lib/utils/signupLogin';

const reregisterTeamSchema = z.object({
  teamId: z.coerce.number().int().positive('Team is required'),
  divisionId: z.coerce.number().int().positive('Division is required'),
  regionId: z.coerce.number().int().positive('Region is required'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
  const format = await requireFormatByCode(params.formatCode);

  if (format.isIndividual || !format.supportsReregistration) {
    redirect(302, `/signup/${format.code}`);
  }

  const context = await getSignupContext(locals.user?.steamId ?? null, format.id);

  // Load divisions and regions
  const [divisions, regions] = await Promise.all([
    getVisibleDivisions(),
    getRegionsOpenForSignup(format.id),
  ]);

  // Determine if user can re-register and why not
  let canReregister = true;
  let disabledReason = '';

  if (locals.user && isBanned(locals.user)) {
    canReregister = false;
    disabledReason = 'Your account is suspended or banned';
  } else if (context.signupClosed) {
    canReregister = false;
    disabledReason = 'Team signups are currently closed';
  } else if (locals.user && context.ownedTeams.length === 0) {
    canReregister = false;
    disabledReason = 'You have no teams available to re-register';
  } else if (context.rosterLocked) {
    canReregister = false;
    disabledReason = 'Rosters are currently locked';
  } else if (context.hasActiveTeam) {
    canReregister = false;
    disabledReason = `You are already in an active ${format.name} team for this season`;
  }

  // For re-registration, the user keeps whichever owned team they select.
  // Warn only about other old-season memberships (non-owned) that will be auto-removed.
  const ownedTeamIds = new Set(context.ownedTeams.map((t) => t.id));
  const previousSeasonNonOwnedTeams = context.previousSeasonTeams.filter(
    (t) => !ownedTeamIds.has(t.id),
  );

  return {
    format: {
      id: format.id,
      name: format.name,
      code: format.code,
      isIndividual: format.isIndividual,
      themeKey: format.themeKey,
    },
    ownedTeams: context.ownedTeams,
    divisions,
    regions,
    canReregister,
    disabledReason,
    needsLogin: !locals.user && canReregister,
    previousSeasonNonOwnedTeams,
  };
};

export const actions: Actions = {
  reregisterTeam: async ({ params, request, locals, url, getClientAddress }) => {
    if (!locals.user) {
      redirect(302, loginToParticipateHref(url.pathname));
    }
    requireNotBanned(locals.user);

    const format = await requireFormatByCode(params.formatCode);

    if (format.isIndividual || !format.supportsReregistration) {
      return fail(400, { error: 'This format does not support team re-registration' });
    }

    const context = await getSignupContext(locals.user.steamId, format.id);

    // Check if signups are closed
    if (context.signupClosed) {
      return fail(400, { error: 'Signups are currently closed' });
    }

    const formData = await request.formData();
    // Validate required fields
    const validation = validateForm(formData, reregisterTeamSchema);
    if (!validation.success) return validationError(validation.errors);

    const { teamId, divisionId, regionId } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      // Get the correct season ID for the selected region
      const seasonId = await getSignupSeasonForRegion(regionId, format.id);

      // Check if payment is required BEFORE re-registering
      const paymentInfo = await checkPaymentRequired({
        divisionId,
        steamId: locals.user.steamId,
        seasonId: seasonId ?? undefined,
      });

      await reregisterTeam({
        teamId,
        divisionId,
        regionId,
        ownerSteamId: locals.user.steamId,
        formatId: format.id,
      });
      const after = await getTeamAuditSnapshot(teamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_CREATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          changedFields: 'seasonId,divisionId,regionId,status',
          reregistration: true,
          seasonIdBefore: before?.seasonId ?? null,
          seasonIdAfter: after?.seasonId ?? null,
          seasonNumBefore: before?.seasonNum ?? null,
          seasonNumAfter: after?.seasonNum ?? null,
          divisionIdBefore: before?.divisionId ?? null,
          divisionIdAfter: after?.divisionId ?? null,
          divisionNameBefore: before?.divisionName ?? null,
          divisionNameAfter: after?.divisionName ?? null,
          regionIdBefore: before?.regionId ?? null,
          regionIdAfter: after?.regionId ?? null,
          regionNameBefore: before?.regionName ?? null,
          regionNameAfter: after?.regionName ?? null,
          statusBefore: before?.status ?? null,
          statusAfter: after?.status ?? null,
          formatId: format.id,
          formatCode: format.code,
        },
        ipAddress: getClientAddress(),
      });

      if (paymentInfo.required && !paymentInfo.alreadyPaid) {
        throw redirect(303, `/checkout/${locals.user.steamId}`);
      }

      throw redirect(303, `/teams/${teamId}?signup=reregistered`);
    } catch (err) {
      if (isRedirect(err)) throw err;

      console.error('Error re-registering team:', err);
      return fail(400, {
        error: getErrorMessage(err, 'Failed to re-register team'),
      });
    }
  },
};
