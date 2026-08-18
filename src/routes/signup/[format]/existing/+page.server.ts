import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireNotBanned, isBanned } from '$lib/server/auth/permissions';
import { getSignupContext, reregisterTeam } from '$lib/server/services/teamSignup';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import { getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { getTeamAuditSnapshot } from '$lib/server/services/teams';
import { parseTeamFormatCode } from '$lib/server/constants/formats';
import { error, fail, isRedirect, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const reregisterTeamSchema = z.object({
  teamId: z.coerce.number().int().positive('Team is required'),
  divisionId: z.coerce.number().int().positive('Division is required'),
  regionId: z.coerce.number().int().positive('Region is required'),
});

function teamFormatOrThrow(raw: string | undefined) {
  if (raw === '1v1') throw redirect(302, '/signup/1v1');
  const format = parseTeamFormatCode(raw);
  if (!format) throw error(404, 'Unknown league format');
  return format;
}

export const load: PageServerLoad = async ({ locals, params }) => {
  requireAuth(locals.user);
  const format = teamFormatOrThrow(params.format);

  const context = await getSignupContext(locals.user.steamId, format.id);

  const [divisions, regions] = await Promise.all([getVisibleDivisions(), getVisibleRegions()]);

  let canReregister = true;
  let disabledReason = '';

  if (isBanned(locals.user)) {
    canReregister = false;
    disabledReason = 'Your account is suspended or banned';
  } else if (context.signupClosed) {
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
    disabledReason = `You are already in an active ${format.label} team`;
  }

  const ownedTeamIds = new Set(context.ownedTeams.map((t) => t.id));
  const previousSeasonNonOwnedTeams = context.previousSeasonTeams.filter(
    (t) => !ownedTeamIds.has(t.id),
  );

  return {
    ownedTeams: context.ownedTeams,
    divisions,
    regions,
    canReregister,
    disabledReason,
    previousSeasonNonOwnedTeams,
    formatCode: format.code,
    formatLabel: format.label,
  };
};

export const actions: Actions = {
  reregisterTeam: async ({ request, locals, getClientAddress, params }) => {
    requireNotBanned(locals.user);
    const format = teamFormatOrThrow(params.format);

    const context = await getSignupContext(locals.user.steamId, format.id);

    if (context.signupClosed) {
      return fail(400, { error: 'Signups are currently closed' });
    }

    const formData = await request.formData();
    const validation = validateForm(formData, reregisterTeamSchema);
    if (!validation.success) return validationError(validation.errors);

    const { teamId, divisionId, regionId } = validation.data;

    try {
      const before = await getTeamAuditSnapshot(teamId);
      const seasonId = await getSignupSeasonForRegion(regionId, format.id);

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
          formatId: format.id,
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
