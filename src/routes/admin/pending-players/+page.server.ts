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
import { fail } from '@sveltejs/kit';

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
    const playerSteamId = formData.get('playerSteamId')?.toString();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');

    if (!playerSteamId || !teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid parameters' });
    }

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await approvePlayer(playerSteamId, teamId, audit);
      return { success: true, message: 'Player approved successfully' };
    } catch (error) {
      console.error('Error approving player:', error);
      return fail(500, { error: 'Failed to approve player' });
    }
  },

  decline: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const playerSteamId = formData.get('playerSteamId')?.toString();
    const teamId = parseInt(formData.get('teamId')?.toString() || '');
    const reason = formData.get('reason')?.toString() || '';

    if (!playerSteamId || !teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid parameters' });
    }

    if (!reason || reason.trim().length === 0) {
      return fail(400, { error: 'Decline reason is required' });
    }

    const audit: AuditContext = {
      actorId: locals.user.steamId,
      actorRole: locals.user.permissionLevel,
      ipAddress: getClientAddress(),
    };

    try {
      await declinePlayer(playerSteamId, teamId, audit, reason);
      return { success: true, message: 'Player declined successfully' };
    } catch (error) {
      console.error('Error declining player:', error);
      return fail(500, { error: 'Failed to decline player' });
    }
  },
};
