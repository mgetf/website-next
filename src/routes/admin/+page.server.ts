/**
 * Admin Dashboard - Server Logic
 * Loads actionable work items and league analytics
 */

import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { getAdminAnalytics } from '#lib/server/services/analytics.js';
import {
  getPendingApprovals,
  approvePendingItem,
  declinePendingItem,
} from '#lib/server/services/pendingPlayers.js';
import type { AuditContext } from '#lib/server/services/pendingPlayers.js';
import { getRecentUnplayedMatches } from '#lib/server/services/adminMatches.js';
import { getActiveSignupSeasonsWithDeadlines } from '#lib/server/services/signupSeasons.js';
import { isHttpError } from '@sveltejs/kit';
import { z } from 'zod';
import { formError, validateForm, validationError } from '#lib/server/utils/forms.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

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

  const [analytics, pendingApprovals, recentMatches, activeSignupSeasons] = await Promise.all([
    getAdminAnalytics(),
    getPendingApprovals(),
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
    pendingApprovals,
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
