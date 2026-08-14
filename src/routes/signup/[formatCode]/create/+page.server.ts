import type { PageServerLoad, Actions } from './$types';
import { requireAuth, requireNotBanned, isBanned } from '$lib/server/auth/permissions';
import { requireFormatByCode } from '$lib/server/services/formats';
import { getSignupContext, createTeam } from '$lib/server/services/teamSignup';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { checkPaymentRequired } from '$lib/server/services/payments';
import { getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { getTeamAuditSnapshot } from '$lib/server/services/teams';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  validateUploadedFile,
  saveTempFile,
  uploadToR2,
  deleteTempFile,
} from '$lib/server/utils/r2Upload';
import path from 'path';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const createTeamFormSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  acronym: z.string().optional().default(''),
  divisionId: z.coerce.number().int().positive('Division is required'),
  regionId: z.coerce.number().int().positive('Region is required'),
  joinPassword: z.string().min(1, 'Join password is required'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const format = await requireFormatByCode(params.formatCode);

  if (format.isIndividual) {
    redirect(302, `/signup/${format.code}`);
  }

  const context = await getSignupContext(locals.user.steamId, format.id);

  // Load divisions and regions
  const [divisions, regions] = await Promise.all([getVisibleDivisions(), getVisibleRegions()]);

  // Determine if user can create a team and why not
  let canCreate = true;
  let disabledReason = '';

  if (isBanned(locals.user)) {
    canCreate = false;
    disabledReason = 'Your account is suspended or banned';
  } else if (context.signupClosed) {
    canCreate = false;
    disabledReason = 'Team signups are currently closed';
  } else if (context.hasActiveTeam) {
    canCreate = false;
    disabledReason = `You are already in an active ${format.name} team for this season`;
  } else if (context.rosterLocked) {
    canCreate = false;
    disabledReason = 'Rosters are currently locked';
  }

  return {
    format: {
      id: format.id,
      name: format.name,
      code: format.code,
      isIndividual: format.isIndividual,
      supportsAcronym: format.supportsAcronym,
      themeKey: format.themeKey,
    },
    divisions,
    regions,
    canCreate,
    disabledReason,
    previousSeasonTeams: context.previousSeasonTeams,
  };
};

export const actions: Actions = {
  createTeam: async ({ params, request, locals, getClientAddress }) => {
    requireNotBanned(locals.user);

    const format = await requireFormatByCode(params.formatCode);

    if (format.isIndividual) {
      return fail(400, { error: 'Cannot create team for individual format' });
    }

    const context = await getSignupContext(locals.user.steamId, format.id);

    // Check if signups are closed
    if (context.signupClosed) {
      return fail(400, { error: 'Signups are currently closed' });
    }

    const formData = await request.formData();
    // Validate required fields
    const validation = validateForm(formData, createTeamFormSchema);
    if (!validation.success) return validationError(validation.errors);

    const { name, acronym, divisionId, regionId, joinPassword } = validation.data;
    const avatar = formData.get('avatar');

    // Handle avatar upload if provided
    let avatarUrl: string | undefined;
    let tempFilePath: string | undefined;

    if (avatar instanceof File && avatar.size > 0) {
      try {
        // Validate file
        validateUploadedFile(avatar);

        // Save temporarily
        tempFilePath = await saveTempFile(avatar);

        // Upload to R2 (returns null if R2 not configured)
        const ext = path.extname(avatar.name);
        const remotePath = `team-avatars/${Date.now()}${ext}`;
        const uploadResult = await uploadToR2(tempFilePath, remotePath);

        if (uploadResult) {
          avatarUrl = uploadResult;
        } else {
          // R2 not configured, skip avatar upload
          console.warn('Avatar upload skipped - R2 not configured');
        }

        // Delete temp file
        deleteTempFile(tempFilePath);
      } catch (err) {
        if (tempFilePath) {
          deleteTempFile(tempFilePath);
        }
        return fail(400, { error: getErrorMessage(err, 'Failed to upload avatar') });
      }
    }

    try {
      // Get the correct season ID for the selected region
      const seasonId = await getSignupSeasonForRegion(regionId, format.id);

      // Check if payment is required BEFORE creating the team
      const paymentInfo = await checkPaymentRequired({
        divisionId,
        steamId: locals.user.steamId,
        seasonId: seasonId ?? undefined,
      });

      // Create team
      const teamId = await createTeam({
        name,
        acronym: format.supportsAcronym && acronym ? acronym : undefined,
        avatar: avatarUrl,
        divisionId,
        regionId,
        joinPassword,
        ownerSteamId: locals.user.steamId,
        formatId: format.id,
      });

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.TEAM,
        action: AuditAction.TEAM_CREATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          name,
          acronym: format.supportsAcronym && acronym ? acronym : null,
          divisionId,
          regionId,
          seasonId: seasonId ?? null,
          paymentRequired: paymentInfo.required,
          alreadyPaid: paymentInfo.alreadyPaid,
          avatarUploaded: Boolean(avatarUrl),
          status: (await getTeamAuditSnapshot(teamId))?.status ?? null,
          formatId: format.id,
          formatCode: format.code,
        },
        ipAddress: getClientAddress(),
      });

      if (paymentInfo.required && !paymentInfo.alreadyPaid) {
        throw redirect(303, `/checkout/${locals.user.steamId}`);
      }

      throw redirect(303, `/teams/${teamId}?signup=created`);
    } catch (err) {
      if (isRedirect(err)) throw err;

      console.error('Error creating team:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to create team') });
    }
  },
};
