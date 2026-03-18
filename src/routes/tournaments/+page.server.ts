/**
 * Tournaments Listing Page - Server Logic
 * Displays all tournaments (Cups, World Championships, Fight Nights)
 * Admin actions: create, set winners, delete tournaments
 */

import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import {
  getAllTournaments,
  getAllFightNights,
  createTournament,
  updateTournamentWinners,
} from '$lib/server/services/tournaments';
import { getAllChampionships } from '$lib/server/services/championships';
import { isAdmin } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ locals }) => {
  const [tournaments, championships, fightNights] = await Promise.all([
    getAllTournaments(),
    getAllChampionships(),
    getAllFightNights(),
  ]);

  return {
    tournaments,
    championships,
    fightNights,
    isGlobalAdmin: isAdmin(locals.user),
  };
};

export const actions: Actions = {
  /**
   * Create a new tournament (Admin only)
   */
  create: async ({ request, locals, getClientAddress }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Unauthorized - Admin access required' });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const description = formData.get('description') as string;
    const bracketLink = formData.get('bracketLink') as string;
    const avatar = formData.get('avatar') as string;
    const startedAtStr = formData.get('startedAt') as string;
    const isTeamTournament = formData.get('isTeamTournament') === 'on';

    if (!name || name.trim().length === 0) {
      return fail(400, { error: 'Tournament name is required' });
    }

    try {
      const startedAt = startedAtStr ? new Date(startedAtStr) : undefined;

      await createTournament({
        name: name.trim(),
        description: description?.trim() || undefined,
        bracketLink: bracketLink?.trim() || undefined,
        avatar: avatar?.trim() || undefined,
        startedAt,
        isTeamTournament,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.TOURNAMENT,
        action: AuditAction.TOURNAMENT_CREATED,
        metadata: { name: name.trim(), isTeamTournament },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Tournament created successfully' };
    } catch (error) {
      console.error('Error creating tournament:', error);
      return fail(500, { error: 'Failed to create tournament' });
    }
  },

  /**
   * Set tournament winners (Admin only)
   */
  setWinners: async ({ request, locals, getClientAddress }) => {
    if (!isAdmin(locals.user)) {
      return fail(403, { error: 'Unauthorized - Admin access required' });
    }

    const formData = await request.formData();
    const tournamentId = parseInt(formData.get('tournamentId') as string);
    const winner1SteamId = (formData.get('winner1SteamId') as string)?.trim();
    const winner2SteamId = (formData.get('winner2SteamId') as string)?.trim();
    const secondPlace1SteamId = (formData.get('secondPlace1SteamId') as string)?.trim();
    const secondPlace2SteamId = (formData.get('secondPlace2SteamId') as string)?.trim();
    const thirdPlace1SteamId = (formData.get('thirdPlace1SteamId') as string)?.trim();
    const thirdPlace2SteamId = (formData.get('thirdPlace2SteamId') as string)?.trim();

    if (!tournamentId || isNaN(tournamentId)) {
      return fail(400, { error: 'Invalid tournament ID' });
    }

    try {
      await updateTournamentWinners(tournamentId, {
        winner1SteamId: winner1SteamId || undefined,
        winner2SteamId: winner2SteamId || undefined,
        secondPlace1SteamId: secondPlace1SteamId || undefined,
        secondPlace2SteamId: secondPlace2SteamId || undefined,
        thirdPlace1SteamId: thirdPlace1SteamId || undefined,
        thirdPlace2SteamId: thirdPlace2SteamId || undefined,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.TOURNAMENT,
        action: AuditAction.TOURNAMENT_UPDATED,
        targetType: 'Tournament',
        targetId: String(tournamentId),
        metadata: { winner1SteamId, winner2SteamId, secondPlace1SteamId, secondPlace2SteamId },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Winners updated successfully' };
    } catch (error) {
      console.error('Error setting winners:', error);
      return fail(500, { error: 'Failed to update winners' });
    }
  },
};
