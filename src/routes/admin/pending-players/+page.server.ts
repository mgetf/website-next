import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getPendingApprovals,
  approvePendingItem,
  declinePendingItem,
} from '$lib/server/services/pendingPlayers';
import type { AuditContext } from '$lib/server/services/pendingPlayers';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { getRegionIdsByFormat } from '$lib/server/services/staffAssignments';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { formError, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

const approveSchema = z.object({
  kind: z.enum(['JOIN_REQUEST', 'ENTRY_READY']).default('JOIN_REQUEST'),
  playerSteamId: z.string().optional().default(''),
  teamId: z.coerce.number().int().positive('Invalid team'),
});

const declineSchema = approveSchema.extend({
  reason: z.string().min(1, 'Decline reason is required'),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [pendingApprovals, divisions, regions, formats, regionIdsByFormat] = await Promise.all([
    getPendingApprovals(),
    getVisibleDivisions(),
    getVisibleRegions(),
    getFormatsForFilter(),
    getRegionIdsByFormat(),
  ]);

  return {
    pendingApprovals,
    divisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      regionId: division.regionId,
      formatId: division.formatId,
    })),
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    formats: formats.map((format) => ({ id: format.id, name: format.name })),
    regionIdsByFormat,
  };
};

export const actions: Actions = {
  approve: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, approveSchema);
    if (!validation.success) return validationError(validation.errors);

    const { kind, playerSteamId, teamId } = validation.data;

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await approvePendingItem(kind, teamId, playerSteamId, audit);
      return {
        success: true,
        message:
          kind === 'ENTRY_READY' ? 'Entry approved successfully' : 'Player approved successfully',
      };
    } catch (err) {
      const status = isHttpError(err) ? err.status : 500;
      return formError(getErrorMessage(err, 'Failed to approve'), status);
    }
  },

  decline: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, declineSchema);
    if (!validation.success) return validationError(validation.errors);

    const { kind, playerSteamId, teamId, reason } = validation.data;

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await declinePendingItem(kind, teamId, playerSteamId, audit, reason);
      return {
        success: true,
        message:
          kind === 'ENTRY_READY'
            ? 'Ready-up rejected; entry set back to unready'
            : 'Player declined successfully',
      };
    } catch (err) {
      const status = isHttpError(err) ? err.status : 500;
      return formError(getErrorMessage(err, 'Failed to decline'), status);
    }
  },
};
