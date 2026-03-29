/**
 * Match Creation Wizard - Server Logic
 * Dedicated page for creating matches with a progressive wizard interface
 */

import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireStrictAdmin } from '$lib/server/auth/permissions';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  getEligibleTeams,
  createMatchSet,
  calculateWeekLabel as calculateWeekLabelService,
} from '$lib/server/services/adminMatches';
import { getSeasons, getSeasonById } from '$lib/server/services/seasons';
import { getRegions } from '$lib/server/services/regions';
import { getDivisions } from '$lib/server/services/divisions';
import { getArenas } from '$lib/server/services/arenas';
import { getMapBanPools } from '$lib/server/services/mapBanPools';
import { getAllPlayoffs, getPlayoffBySeason } from '$lib/server/services/playoffs';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';

const optionalInt = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.coerce.number().int().optional(),
);

const previewMatchesSchema = z.object({
  regionId: z.coerce.number().int(),
  divisionId: z.coerce.number().int(),
  seasonId: z.coerce.number().int(),
  weekNo: optionalInt,
  isPlayoff: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
  playoffRound: optionalInt,
});

const createMatchSetSchema = z.object({
  regionId: z.coerce.number().int(),
  divisionId: z.coerce.number().int(),
  seasonId: z.coerce.number().int(),
  boSeries: z.coerce.number().int(),
  weekNo: optionalInt,
  arenaId: optionalInt,
  matchDateTime: z.string().optional().default(''),
  mapBanPoolId: optionalInt,
  isPlayoff: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
  playoffRound: optionalInt,
  boGames: optionalInt,
  homeTeamIds: z.array(z.coerce.number().int()).optional().default([]),
  awayTeamIds: z.array(z.coerce.number().int()).optional().default([]),
});

export const load: PageServerLoad = async ({ locals }) => {
  requireStrictAdmin(locals.user);

  // Fetch data for dropdowns using services
  const [seasons, regions, divisions, arenas, mapBanPools, playoffs] = await Promise.all([
    getSeasons(),
    getRegions(),
    getDivisions(),
    getArenas(),
    getMapBanPools(),
    getAllPlayoffs(),
  ]);

  return {
    seasons,
    regions,
    divisions,
    mapBanPools,
    arenas,
    playoffs,
  };
};

export const actions: Actions = {
  /**
   * Preview eligible teams and match pairings (includes week label calculation)
   */
  previewMatches: async ({ request, locals }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, previewMatchesSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId, divisionId, seasonId, weekNo, isPlayoff, playoffRound } = validation.data;

    try {
      const teams = await getEligibleTeams(regionId, divisionId, seasonId);

      if (teams.length === 0) {
        return {
          preview: {
            teams: [],
            matchups: [],
            weekLabel: null,
            existingCount: 0,
            isPlayoff,
          },
          success: true,
        };
      }

      // Assign seeds based on sorted order (getEligibleTeams already sorts by wins/losses)
      const teamsWithSeeds = teams.map((team, index) => ({
        ...team,
        seed: index + 1,
      }));

      if (isPlayoff && playoffRound) {
        // For playoff matches, get playoff configuration to calculate number of matches
        const playoff = await getPlayoffBySeason(seasonId);
        if (!playoff || !playoff.numRounds) {
          return fail(400, {
            error: 'No playoff configuration found for this season',
          });
        }

        // Calculate number of matches for this round
        const numMatches = Math.pow(2, playoff.numRounds - Math.abs(playoffRound));

        // For playoff preview, return empty matchups that will be manually filled
        const emptyMatchups = Array.from({ length: numMatches }, (_, i) => ({
          index: i,
          home: null,
          away: null,
        }));

        return {
          preview: {
            teams: teamsWithSeeds,
            matchups: emptyMatchups,
            weekLabel: null,
            existingCount: 0,
            isPlayoff: true,
            playoffRound,
            numRounds: playoff.numRounds,
          },
          success: true,
        };
      } else {
        // Regular season logic
        // Generate matchups using the pairing algorithm
        const { pairTeamsForMatches } = await import('$lib/server/services/adminMatches');
        const pairedTeams = await pairTeamsForMatches(teams, seasonId);

        // Convert paired teams array into matchup objects
        const matchups = [];
        for (let i = 0; i < pairedTeams.length - 1; i += 2) {
          const homeTeam = pairedTeams[i];
          const awayTeam = pairedTeams[i + 1];

          // Find seeds for these teams
          const homeTeamWithSeed = teamsWithSeeds.find((t) => t.id === homeTeam.id);
          const awayTeamWithSeed = teamsWithSeeds.find((t) => t.id === awayTeam.id);

          matchups.push({
            home: homeTeamWithSeed,
            away: awayTeamWithSeed,
          });
        }

        // Check if there's a bye (odd number of teams)
        const byeTeam =
          pairedTeams.length < teams.length
            ? teamsWithSeeds.find((t) => !pairedTeams.some((pt) => pt.id === t.id))
            : null;

        // Calculate week label if not playoff and week number provided
        let weekLabel = null;
        let existingCount = 0;

        console.log('Week label calculation check:', {
          weekNo,
          isPlayoff,
          shouldCalculate: weekNo && !isPlayoff,
        });

        if (weekNo && !isPlayoff) {
          console.log('Calculating week label for:', {
            regionId,
            divisionId,
            seasonId,
            weekNo,
          });
          const weekLabelData = await calculateWeekLabelService(
            regionId,
            divisionId,
            seasonId,
            weekNo,
          );
          weekLabel = weekLabelData.weekLabel;
          existingCount = weekLabelData.existingCount;
          console.log('Week label calculated:', { weekLabel, existingCount });
        }

        return {
          preview: {
            teams: teamsWithSeeds,
            matchups,
            byeTeam,
            weekLabel,
            existingCount,
            isPlayoff: false,
          },
          success: true,
        };
      }
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Failed to load teams') });
    }
  },

  /**
   * Create the match set
   */
  createMatchSet: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createMatchSetSchema, ['homeTeamIds', 'awayTeamIds']);
    if (!validation.success) return validationError(validation.errors);
    const {
      regionId,
      divisionId,
      seasonId,
      boSeries,
      weekNo,
      arenaId,
      matchDateTime,
      mapBanPoolId,
      isPlayoff,
      playoffRound,
      boGames,
      homeTeamIds,
      awayTeamIds,
    } = validation.data;

    console.log('Create match set params:', {
      regionId,
      divisionId,
      seasonId,
      weekNo,
      boSeries,
      arenaId,
      matchDateTime,
      mapBanPoolId,
      isPlayoff,
      playoffRound,
      boGames,
    });

    // Additional validation for playoff matches
    if (isPlayoff) {
      if (!playoffRound) {
        return fail(400, {
          error: 'Playoff round is required for playoff matches',
        });
      }
      if (!mapBanPoolId) {
        return fail(400, {
          error: 'Map ban pool is required for playoff matches',
        });
      }
    } else {
      // Validation for regular (non-playoff) matches
      if (!weekNo || weekNo < 1) {
        return fail(400, {
          error: 'Week number is required for regular season matches',
        });
      }
    }

    try {
      // Get season to extract seasonNo
      const season = await getSeasonById(seasonId);

      if (!season) {
        console.error('Season not found:', seasonId);
        return fail(400, { error: 'Season not found' });
      }

      let matches;

      if (isPlayoff) {
        // Get playoff configuration
        const playoff = await getPlayoffBySeason(seasonId);
        if (!playoff) {
          return fail(400, {
            error: 'No playoff configuration found for this season',
          });
        }

        console.log('Creating playoff matches with params:', {
          regionId,
          divisionId,
          seasonId,
          seasonNo: season.seasonNum,
          playoffRound,
          boSeries,
          boGames,
          mapBanPoolId,
        });

        if (homeTeamIds.length === 0 || awayTeamIds.length === 0) {
          return fail(400, {
            error: 'Please select teams for all playoff matchups',
          });
        }

        if (homeTeamIds.length !== awayTeamIds.length) {
          return fail(400, {
            error: 'Home and away team selections must match',
          });
        }

        // Create playoff matches using the existing createPlayoffMatch function
        const { createPlayoffMatch } = await import('$lib/server/services/adminMatches');
        const createdMatches = [];

        for (let i = 0; i < homeTeamIds.length; i++) {
          const homeTeamId = homeTeamIds[i];
          const awayTeamId = awayTeamIds[i];

          const match = await createPlayoffMatch({
            seasonId,
            seasonNo: season.seasonNum,
            playoffId: playoff.id,
            playoffRound: playoffRound!,
            homeTeamId,
            awayTeamId,
            boSeries,
            boGames: boGames || undefined,
            matchDateTime,
            mapBanPoolId,
          });

          createdMatches.push(match);
        }

        matches = createdMatches;
        console.log('Successfully created playoff matches:', matches.length);
      } else {
        console.log('Creating regular season matches with params:', {
          regionId,
          divisionId,
          seasonId,
          seasonNo: season.seasonNum,
          weekNo,
          boSeries,
          arenaId,
          matchDateTime,
          mapBanPoolId,
        });

        matches = await createMatchSet(regionId, divisionId, {
          seasonId,
          seasonNo: season.seasonNum,
          weekNo: weekNo || undefined,
          boSeries,
          arenaId,
          matchDateTime,
          mapBanPoolId,
        });

        console.log('Successfully created regular season matches:', matches.length);
      }

      await logAudit({
        actorId: locals.user?.steamId,
        actorRole: locals.user?.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_CREATED,
        targetType: 'Season',
        targetId: String(seasonId),
        metadata: { matchCount: matches.length, isPlayoff, divisionId, weekNo: weekNo ?? null },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/admin/matches?created=${matches.length}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      console.error('Error creating match set:', err);
      return fail(400, { error: getErrorMessage(err, 'Failed to create matches') });
    }
  },
};
