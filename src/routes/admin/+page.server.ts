/**
 * Admin Dashboard - Server Logic
 * Loads actionable work items and league analytics
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getAdminAnalytics } from '$lib/server/services/analytics';
import {
  getPendingPlayers,
  approvePlayer,
  declinePlayer,
} from '$lib/server/services/pendingPlayers';
import type { AuditContext } from '$lib/server/services/pendingPlayers';
import { getRecentUnplayedMatches } from '$lib/server/services/adminMatches';
import { getActiveSignupSeasonsWithDeadlines } from '$lib/server/services/signupSeasons';
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

  const [analytics, pendingPlayers, recentMatches, activeSignupSeasons] = await Promise.all([
    getAdminAnalytics(),
    getPendingPlayers(),
    getRecentUnplayedMatches(10),
    getActiveSignupSeasonsWithDeadlines(),
  ]);

  // Find the season with the earliest upcoming deadline (for the dashboard urgency display)
  // If multiple seasons have deadlines, show the most urgent one
  let earliestDeadline: Date | null = null;
  let matchWeekForDeadline: number | null = null;

  for (const ass of activeSignupSeasons) {
    const deadline = ass.season.matchDeadline;
    if (deadline) {
      if (!earliestDeadline || deadline < earliestDeadline) {
        earliestDeadline = deadline;
        matchWeekForDeadline = ass.season.matchWeek;
      }
    }
  }

  return {
    analytics,
    pendingPlayers,
    recentMatches,
    matchDeadline: earliestDeadline?.toISOString() || null,
    currentMatchWeek: matchWeekForDeadline,
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
