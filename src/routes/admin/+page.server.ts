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
import { prisma } from '$lib/server/db';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals.user);

  const [analytics, pendingPlayers, recentMatches, activeSignupSeasons] =
    await Promise.all([
      getAdminAnalytics(),
      getPendingPlayers(),
      getRecentUnplayedMatches(10), // Get up to 10 recent unplayed matches
      // Get active signup seasons with their per-season settings
      prisma.activeSignupSeason.findMany({
        include: {
          season: {
            select: {
              matchWeek: true,
              matchDeadline: true,
            },
          },
        },
      }),
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
