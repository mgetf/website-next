import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getPendingPlayers,
  approvePlayer,
  declinePlayer,
} from '$lib/server/services/pendingPlayers';
import type { AuditContext } from '$lib/server/services/pendingPlayers';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { formError, validateForm, validationError } from '$lib/server/utils/forms';
import { getErrorMessage } from '$lib/server/utils/errors';

const approveSchema = z.object({
  playerSteamId: z.string().min(1, 'Invalid player'),
  teamId: z.coerce.number().int().positive('Invalid team'),
});

const declineSchema = approveSchema.extend({
  reason: z.string().min(1, 'Decline reason is required'),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [pendingPlayers, divisions, regions] = await Promise.all([
    getPendingPlayers(),
    getVisibleDivisions(),
    getVisibleRegions(),
  ]);

  return {
    pendingPlayers,
    divisions,
    regions,
  };
};

export const actions: Actions = {
  approve: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, approveSchema);
    if (!validation.success) return validationError(validation.errors);

    const { playerSteamId, teamId } = validation.data;

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await approvePlayer(playerSteamId, teamId, audit);
      return { success: true, message: 'Player approved successfully' };
    } catch (err) {
      const status = isHttpError(err) ? err.status : 500;
      return formError(getErrorMessage(err, 'Failed to approve player'), status);
    }
  },

  decline: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, declineSchema);
    if (!validation.success) return validationError(validation.errors);

    const { playerSteamId, teamId, reason } = validation.data;

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await declinePlayer(playerSteamId, teamId, audit, reason);
      return { success: true, message: 'Player declined successfully' };
    } catch (err) {
      const status = isHttpError(err) ? err.status : 500;
      return formError(getErrorMessage(err, 'Failed to decline player'), status);
    }
  },
};
