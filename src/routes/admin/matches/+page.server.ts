/**
 * Admin Match Management - Server Logic
 * Matches by week view (RGL-style layout)
 */

import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { MatchStatus } from '$prisma/client.js';
import {
  updateMatchStatus,
  getWeekOptionsForSeason,
  getMatchesForAdminWeekView,
} from '$lib/server/services/adminMatches';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { getRegionsForFilter } from '$lib/server/services/regions';
import { getSeasonsByRegion } from '$lib/server/services/seasons';
import { parseFilterId, resolveAdminMatchFilters } from '$lib/utils/matchFilters';
import { getMatchWeekLabels } from '$lib/server/services/matches';
import { listPendingMatchSetDrafts } from '$lib/server/services/matchSetDrafts';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';

const updateMatchStatusSchema = z.object({
  matchId: z.coerce.number().int(),
  status: z.coerce.number().int().min(0).max(2),
});

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const [regions, formats, seasons, pendingDrafts] = await Promise.all([
    getRegionsForFilter(),
    getFormatsForFilter(),
    getSeasonsByRegion(),
    listPendingMatchSetDrafts(),
  ]);

  const resolved = resolveAdminMatchFilters({
    formats,
    regions,
    seasons,
    formatId: parseFilterId(url.searchParams.get('formatId')),
    regionId: parseFilterId(url.searchParams.get('regionId')),
    seasonId: parseFilterId(url.searchParams.get('seasonId')),
  });

  const weekOptions = await getWeekOptionsForSeason(resolved.seasonId);
  const requestedWeek = url.searchParams.get('week');
  const week =
    requestedWeek && weekOptions.some((option) => option.value === requestedWeek)
      ? requestedWeek
      : (weekOptions[0]?.value ?? null);

  let weekNo: number | null = null;
  let playoffRound: number | null = null;

  if (week?.startsWith('p')) {
    playoffRound = parseInt(week.slice(1));
  } else if (week) {
    weekNo = parseInt(week);
  }

  let matchesByDivision: Record<string, any[]> = {};

  if (resolved.seasonId && (weekNo !== null || playoffRound !== null)) {
    const matches = await getMatchesForAdminWeekView({
      seasonId: resolved.seasonId,
      weekNo,
      playoffRound,
    });

    const weekLabelMap = await getMatchWeekLabels(matches);
    const matchesWithLabels = matches.map((match) => ({
      ...match,
      weekLabel: weekLabelMap.get(match.id) || null,
    }));

    for (const match of matchesWithLabels) {
      if (!match.homeTeam || !match.awayTeam) continue;

      const divisionName = match.homeTeam.division?.name || 'Unknown Division';
      const divisionId = match.homeTeam.division?.id || 0;
      const divisionKey = `${divisionId}:${divisionName}`;

      if (!matchesByDivision[divisionKey]) {
        matchesByDivision[divisionKey] = [];
      }
      matchesByDivision[divisionKey].push(match);
    }
  }

  const sortedDivisions = Object.entries(matchesByDivision)
    .sort(([keyA], [keyB]) => {
      const idA = parseInt(keyA.split(':')[0]);
      const idB = parseInt(keyB.split(':')[0]);
      return idB - idA;
    })
    .map(([key, matches]) => ({
      name: key.split(':')[1],
      id: parseInt(key.split(':')[0]),
      matches,
    }));

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    pendingDrafts,
    matchesByDivision: sortedDivisions,
    formats: formats.map((format) => ({ id: format.id, name: format.name })),
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    seasons: seasons.map((season) => ({
      id: season.id,
      seasonNum: season.seasonNum,
      regionId: season.regionId,
      formatId: season.formatId,
    })),
    weekOptions,
    filters: {
      formatId: resolved.formatId?.toString() ?? '',
      regionId: resolved.regionId?.toString() ?? '',
      seasonId: resolved.seasonId?.toString() ?? '',
      week: week ?? '',
    },
  };
};

export const actions: Actions = {
  updateMatchStatus: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, updateMatchStatusSchema);
    if (!validation.success) return validationError(validation.errors);
    const { matchId, status } = validation.data;

    const statusMap: Record<number, MatchStatus> = {
      0: MatchStatus.UNPLAYED,
      1: MatchStatus.PLAYED,
      2: MatchStatus.DISPUTE,
    };
    const newStatus = statusMap[status]!;

    try {
      await updateMatchStatus(matchId, newStatus);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_STATUS_CHANGED,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { newStatus },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Match status updated' };
    } catch (err) {
      return fail(500, { error: 'Failed to update match status' });
    }
  },
};
