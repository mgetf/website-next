/**
 * Match Creation Wizard - Server Logic
 * Dedicated page for creating match set drafts with a progressive wizard interface
 */

import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { ActionFailure } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin, requireStrictAdmin, isStrictAdmin } from '#lib/server/auth/permissions.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';
import {
  getEligibleTeams,
  calculateWeekLabel as calculateWeekLabelService,
} from '#lib/server/services/adminMatches.js';
import { getSeasonById } from '#lib/server/services/seasons.js';
import { getRegions } from '#lib/server/services/regions.js';
import { getDivisionScope, getDivisions } from '#lib/server/services/divisions.js';
import {
  getAllActiveSignupSeasons,
  getSignupSeasonForRegion,
} from '#lib/server/services/signupSeasons.js';
import { getArenas } from '#lib/server/services/arenas.js';
import { getMapBanPools } from '#lib/server/services/mapBanPools.js';
import { getAllPlayoffs, getPlayoffBySeason } from '#lib/server/services/playoffs.js';
import {
  getMatchSetDraftDetail,
  publishMatchSetDraft,
  saveMatchSetDraft,
  type SaveMatchSetDraftInput,
} from '#lib/server/services/matchSetDrafts.js';
import { logAudit, AuditCategory, AuditAction } from '#lib/server/services/auditLog.js';
import { z } from 'zod';
import {
  formError,
  validateForm,
  validationError,
  type FormActionError,
} from '#lib/server/utils/forms.js';

const optionalInt = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.coerce.number().int().optional(),
);

const previewMatchesSchema = z.object({
  regionId: z.coerce.number().int(),
  divisionId: z.coerce.number().int(),
  weekNo: optionalInt,
  isPlayoff: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
  playoffRound: optionalInt,
});

const saveMatchSetSchema = z.object({
  draftId: optionalInt,
  regionId: z.coerce.number().int(),
  divisionId: z.coerce.number().int(),
  boSeries: z.coerce.number().int(),
  weekNo: optionalInt,
  arenaId: optionalInt,
  matchDateTime: z.string().optional().default(''),
  matchTimezone: z.string().optional().default(''),
  mapBanPoolId: optionalInt,
  isPlayoff: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
  playoffRound: optionalInt,
  boGames: optionalInt,
  homeTeamIds: z.array(z.coerce.number().int()).optional().default([]),
  awayTeamIds: z.array(z.coerce.number().int()).optional().default([]),
  byeTeamIds: z.array(z.coerce.number().int()).optional().default([]),
});

async function resolveCurrentSeason(
  regionId: number,
  divisionId: number,
): Promise<{ seasonId: number } | { error: string }> {
  const division = await getDivisionScope(divisionId);
  if (!division || division.regionId !== regionId) {
    return { error: 'Division does not belong to this region' };
  }

  const seasonId = await getSignupSeasonForRegion(regionId, division.formatId);
  if (seasonId == null) {
    return { error: 'No current season for this format and region' };
  }

  return { seasonId };
}

async function buildDraftInput(
  formData: FormData,
  actorId: string,
): Promise<{ data: SaveMatchSetDraftInput } | { error: ActionFailure<FormActionError> }> {
  const validation = validateForm(formData, saveMatchSetSchema, [
    'homeTeamIds',
    'awayTeamIds',
    'byeTeamIds',
  ]);
  if (!validation.success) return { error: validationError(validation.errors) };
  const {
    draftId,
    regionId,
    divisionId,
    boSeries,
    weekNo,
    arenaId,
    matchDateTime,
    matchTimezone,
    mapBanPoolId,
    isPlayoff,
    playoffRound,
    boGames,
    homeTeamIds,
    awayTeamIds,
    byeTeamIds,
  } = validation.data;

  if (isPlayoff) {
    if (!playoffRound) {
      return { error: formError('Playoff round is required for playoff matches') };
    }
    if (!mapBanPoolId) {
      return { error: formError('Map ban pool is required for playoff matches') };
    }
  } else if (!weekNo || weekNo < 1) {
    return { error: formError('Week number is required for regular season matches') };
  }

  if (homeTeamIds.length === 0 || awayTeamIds.length === 0) {
    return { error: formError('Please select teams for all matchups') };
  }
  if (homeTeamIds.length !== awayTeamIds.length) {
    return { error: formError('Home and away team selections must match') };
  }

  const resolved = await resolveCurrentSeason(regionId, divisionId);
  if ('error' in resolved) return { error: formError(resolved.error) };
  const { seasonId } = resolved;

  const season = await getSeasonById(seasonId);
  if (!season) {
    return { error: formError('Season not found') };
  }

  let playoffId: number | undefined;
  if (isPlayoff) {
    const playoff = await getPlayoffBySeason(seasonId);
    if (!playoff) {
      return { error: formError('No playoff configuration found for this season') };
    }
    playoffId = playoff.id;
  }

  return {
    data: {
      draftId,
      regionId,
      divisionId,
      seasonId,
      seasonNo: season.seasonNum,
      weekNo: weekNo || undefined,
      boSeries,
      boGames: boGames || undefined,
      arenaId,
      matchDateTime,
      matchTimezone: matchTimezone || undefined,
      mapBanPoolId,
      isPlayoff,
      playoffId,
      playoffRound: playoffRound || undefined,
      pairings: homeTeamIds.map((homeTeamId, i) => ({
        homeTeamId,
        awayTeamId: awayTeamIds[i],
      })),
      byeTeamIds,
      actorId,
    },
  };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  const draftIdParam = url.searchParams.get('draftId');
  const draftId = draftIdParam ? parseInt(draftIdParam, 10) : NaN;

  const [regions, divisions, arenas, mapBanPools, playoffs, activeSignupSeasons] =
    await Promise.all([
      getRegions(),
      getDivisions(),
      getArenas(),
      getMapBanPools(),
      getAllPlayoffs(),
      getAllActiveSignupSeasons(),
    ]);

  let draft = null;
  if (Number.isInteger(draftId) && draftId > 0) {
    const existing = await getMatchSetDraftDetail(draftId);
    if (existing.status !== 'DRAFT') {
      throw redirect(303, `/admin/matches/drafts/${existing.id}`);
    }
    if (existing.kind === 'SINGLE') {
      throw redirect(303, `/admin/matches/new?draftId=${existing.id}`);
    }
    draft = existing;
  }

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    draft,
    regions,
    divisions,
    mapBanPools,
    arenas,
    playoffs,
    activeSeasons: activeSignupSeasons.map((row) => ({
      regionId: row.regionId,
      formatId: row.formatId,
      formatName: row.format.name,
      seasonId: row.seasonId,
      seasonNum: row.season.seasonNum,
      numWeeks: row.season.numWeeks,
    })),
  };
};

export const actions: Actions = {
  /**
   * Preview eligible teams and match pairings (includes week label calculation)
   */
  previewMatches: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, previewMatchesSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId, divisionId, weekNo, isPlayoff, playoffRound } = validation.data;
    const resolved = await resolveCurrentSeason(regionId, divisionId);
    if ('error' in resolved) return fail(400, { error: resolved.error });
    const { seasonId } = resolved;

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
        const { pairTeamsForMatches } = await import('#lib/server/services/adminMatches.js');
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

        if (weekNo && !isPlayoff) {
          const weekLabelData = await calculateWeekLabelService(
            regionId,
            divisionId,
            seasonId,
            weekNo,
          );
          weekLabel = weekLabelData.weekLabel;
          existingCount = weekLabelData.existingCount;
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

  saveDraft: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const built = await buildDraftInput(formData, locals.user.steamId);
    if ('error' in built) return built.error;

    try {
      const draft = await saveMatchSetDraft(built.data);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SET_DRAFT_SAVED,
        targetType: 'MatchSetDraft',
        targetId: String(draft.id),
        metadata: {
          matchCount: draft.pairings.length,
          isPlayoff: draft.isPlayoff,
          divisionId: draft.divisionId,
          weekNo: draft.weekNo,
          byeTeamIds: draft.byeTeams.map((team) => team.id),
        },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/admin/matches/drafts/${draft.id}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, { error: getErrorMessage(err, 'Failed to save draft') });
    }
  },

  publishMatchSet: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);

    const formData = await request.formData();
    const built = await buildDraftInput(formData, locals.user.steamId);
    if ('error' in built) return built.error;

    try {
      const draft = await saveMatchSetDraft(built.data);
      const published = await publishMatchSetDraft(draft.id, locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SET_PUBLISHED,
        targetType: 'MatchSetDraft',
        targetId: String(draft.id),
        metadata: {
          matchCount: published.matchCount,
          byeTeamCount: published.byeTeamCount,
          isPlayoff: draft.isPlayoff,
          divisionId: draft.divisionId,
          weekNo: draft.weekNo,
        },
        ipAddress: getClientAddress(),
      });

      throw redirect(303, `/admin/matches?created=${published.matchCount}`);
    } catch (err) {
      if (isRedirect(err)) throw err;
      return fail(400, { error: getErrorMessage(err, 'Failed to publish matches') });
    }
  },
};
