/**
 * Admin Match Management - Server Logic
 * Matches by week view (RGL-style layout)
 */

import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '$lib/server/auth/permissions';
import { MatchStatus } from '$prisma/client.js';
import {
  createMatchSet,
  createPlayoffMatch,
  getEligibleTeams,
  updateMatchStatus,
  adminUpdateScores,
  getWeekOptionsForSeason,
  getMatchesForAdminWeekView,
} from '$lib/server/services/adminMatches';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getMapBanPools } from '$lib/server/services/mapBanPools';
import { getSeasonsByRegion } from '$lib/server/services/seasons';
import { getMatchWeekLabels } from '$lib/server/services/matches';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const regionIdParam = url.searchParams.get('regionId');
  const seasonIdParam = url.searchParams.get('seasonId');
  const weekParam = url.searchParams.get('week');

  const [divisions, regions, mapBanPools] = await Promise.all([
    getVisibleDivisions(),
    getVisibleRegions(),
    getMapBanPools(),
  ]);

  const selectedRegionId = regionIdParam
    ? parseInt(regionIdParam)
    : (regions[0]?.id ?? null);

  const seasons = await getSeasonsByRegion(selectedRegionId ?? undefined);

  const selectedSeasonId = seasonIdParam
    ? parseInt(seasonIdParam)
    : (seasons[0]?.id ?? null);

  let weekNo: number | null = null;
  let playoffRound: number | null = null;
  let isPlayoffs = false;

  if (weekParam) {
    if (weekParam.startsWith('p')) {
      isPlayoffs = true;
      playoffRound = parseInt(weekParam.slice(1));
    } else {
      weekNo = parseInt(weekParam);
    }
  } else {
    weekNo = 1;
  }

  const weekOptions = await getWeekOptionsForSeason(selectedSeasonId);

  let matchesByDivision: Record<string, any[]> = {};

  if (selectedSeasonId) {
    const matches = await getMatchesForAdminWeekView({
      seasonId: selectedSeasonId,
      weekNo: isPlayoffs ? null : weekNo,
      playoffRound: isPlayoffs ? playoffRound : null,
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
    matchesByDivision: sortedDivisions,
    seasons,
    divisions,
    regions,
    mapBanPools,
    weekOptions,
    filters: {
      regionId: selectedRegionId?.toString() ?? null,
      seasonId: selectedSeasonId?.toString() ?? null,
      week: weekParam ?? '1',
    },
  };
};

export const actions: Actions = {
  previewMatches: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const regionId = parseInt(formData.get('regionId') as string);
    const divisionId = parseInt(formData.get('divisionId') as string);
    const seasonId = parseInt(formData.get('seasonId') as string);

    try {
      const teams = await getEligibleTeams(regionId, divisionId, seasonId);

      return { preview: { teams }, success: true };
    } catch (err: any) {
      return fail(400, { error: err.message || 'Failed to load teams' });
    }
  },

  createMatchSet: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();

    const regionId = parseInt(formData.get('regionId') as string);
    const divisionId = parseInt(formData.get('divisionId') as string);
    const seasonId = parseInt(formData.get('seasonId') as string);
    const seasonNo = parseInt(formData.get('seasonNo') as string);
    const weekNo = parseInt(formData.get('weekNo') as string);
    const boSeries = parseInt(formData.get('boSeries') as string);
    const arenaId = formData.get('arenaId')
      ? parseInt(formData.get('arenaId') as string)
      : undefined;
    const matchDateTime = formData.get('matchDateTime') as string;
    const mapBanPoolId = formData.get('mapBanPoolId')
      ? parseInt(formData.get('mapBanPoolId') as string)
      : undefined;

    try {
      const matches = await createMatchSet(regionId, divisionId, {
        seasonId,
        seasonNo,
        weekNo,
        boSeries,
        arenaId,
        matchDateTime,
        mapBanPoolId,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_CREATED,
        targetType: 'Season',
        targetId: String(seasonId),
        metadata: { matchCount: matches.length, divisionId, weekNo, boSeries },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        message: `Created ${matches.length} matches successfully`,
      };
    } catch (err: any) {
      return fail(400, { error: err.message || 'Failed to create matches' });
    }
  },

  createPlayoffMatch: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();

    const seasonId = parseInt(formData.get('seasonId') as string);
    const seasonNo = parseInt(formData.get('seasonNo') as string);
    const playoffId = parseInt(formData.get('playoffId') as string);
    const playoffRound = parseInt(formData.get('playoffRound') as string);
    const homeTeamId = parseInt(formData.get('homeTeamId') as string);
    const awayTeamId = parseInt(formData.get('awayTeamId') as string);
    const boSeries = parseInt(formData.get('boSeries') as string);
    const boGames = formData.get('boGames')
      ? parseInt(formData.get('boGames') as string)
      : undefined;
    const arenaId = formData.get('arenaId')
      ? parseInt(formData.get('arenaId') as string)
      : undefined;
    const matchDateTime = formData.get('matchDateTime') as string;
    const mapBanPoolId = formData.get('mapBanPoolId')
      ? parseInt(formData.get('mapBanPoolId') as string)
      : undefined;

    try {
      const match = await createPlayoffMatch({
        seasonId,
        seasonNo,
        playoffId,
        playoffRound,
        homeTeamId,
        awayTeamId,
        boSeries,
        boGames,
        arenaId,
        matchDateTime,
        mapBanPoolId,
      });

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_CREATED,
        targetType: 'Match',
        targetId: String(match.id),
        metadata: { playoffRound, homeTeamId, awayTeamId, boSeries, seasonId },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        message: `Playoff match created successfully`,
        matchId: match.id,
      };
    } catch (err: any) {
      return fail(400, {
        error: err.message || 'Failed to create playoff match',
      });
    }
  },

  updateMatchStatus: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const matchId = parseInt(formData.get('matchId') as string);
    const statusNum = parseInt(formData.get('status') as string);

    let newStatus: MatchStatus;
    if (statusNum === 0) newStatus = MatchStatus.UNPLAYED;
    else if (statusNum === 1) newStatus = MatchStatus.PLAYED;
    else if (statusNum === 2) newStatus = MatchStatus.DISPUTE;
    else return fail(400, { error: 'Invalid status' });

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
    } catch (err: any) {
      return fail(500, { error: 'Failed to update match status' });
    }
  },

  updateScores: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const matchId = parseInt(formData.get('matchId') as string);

    const gameResults = [];
    for (let i = 0; i < 10; i++) {
      const homeScoreStr = formData.get(`homeScore_${i}`) as string;
      const awayScoreStr = formData.get(`awayScore_${i}`) as string;

      if (homeScoreStr && awayScoreStr) {
        const homeScore = parseInt(homeScoreStr);
        const awayScore = parseInt(awayScoreStr);

        if (!isNaN(homeScore) && !isNaN(awayScore)) {
          gameResults.push({ gameNum: i + 1, homeScore, awayScore });
        }
      }
    }

    if (gameResults.length === 0) {
      return fail(400, { error: 'No valid scores provided' });
    }

    try {
      await adminUpdateScores(matchId, gameResults);

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SCORES_OVERRIDDEN,
        targetType: 'Match',
        targetId: String(matchId),
        metadata: { gameResults },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Scores updated successfully' };
    } catch (err: any) {
      return fail(500, { error: err.message || 'Failed to update scores' });
    }
  },
};
