/**
 * Single match composer.
 * Moderators save one pairing as a draft. Only admins can publish it.
 */

import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isStrictAdmin, requireAdmin, requireStrictAdmin } from '#lib/server/auth/permissions.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';
import {
  assertEligibleMatchTeams,
  getSingleMatchBoard,
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
} from '#lib/server/services/matchSetDrafts.js';
import { logAudit, AuditCategory, AuditAction } from '#lib/server/services/auditLog.js';
import { z } from 'zod';
import { formError, validateForm, validationError } from '#lib/server/utils/forms.js';

const optionalInt = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.coerce.number().int().optional(),
);

const seriesValues = [1, 3, 5, 7] as const;

const loadBoardSchema = z.object({
  regionId: z.coerce.number().int(),
  divisionId: z.coerce.number().int(),
  weekNo: optionalInt,
  isPlayoff: z
    .string()
    .optional()
    .transform((value) => value === 'on'),
  playoffRound: optionalInt,
});

const saveSingleMatchSchema = loadBoardSchema.extend({
  draftId: optionalInt,
  boSeries: z.coerce
    .number()
    .int()
    .refine((value) => seriesValues.includes(value as (typeof seriesValues)[number])),
  arenaId: optionalInt,
  matchDateTime: z.string().optional().default(''),
  matchTimezone: z.string().optional().default(''),
  mapBanPoolId: optionalInt,
  boGames: optionalInt,
  homeTeamId: z.coerce.number().int().positive(),
  awayTeamId: z.coerce.number().int().positive(),
});

async function resolveCurrentSeason(
  regionId: number,
  divisionId: number,
): Promise<{ ok: true; seasonId: number; formatId: number } | { ok: false; error: string }> {
  const division = await getDivisionScope(divisionId);
  if (!division || division.regionId !== regionId) {
    return { ok: false, error: 'Division does not belong to this region' };
  }

  const seasonId = await getSignupSeasonForRegion(regionId, division.formatId);
  if (seasonId == null) {
    return { ok: false, error: 'No current season for this format and region' };
  }

  return { ok: true, seasonId, formatId: division.formatId };
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
    if (existing.kind === 'SET') {
      throw redirect(303, `/admin/matches/create?draftId=${existing.id}`);
    }
    draft = existing;
  }

  const board =
    draft && (draft.isPlayoff ? draft.playoffRound != null : draft.weekNo != null)
      ? await getSingleMatchBoard({
          regionId: draft.regionId,
          divisionId: draft.divisionId,
          seasonId: draft.seasonId,
          weekNo: draft.isPlayoff ? undefined : (draft.weekNo ?? undefined),
          playoffRound: draft.isPlayoff ? (draft.playoffRound ?? undefined) : undefined,
        })
      : null;

  return {
    isStrictAdmin: isStrictAdmin(locals.user),
    draft,
    board,
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    divisions: divisions.map((division) => ({
      id: division.id,
      name: division.name,
      regionId: division.regionId,
      formatId: division.formatId,
    })),
    arenas: arenas.map((arena) => ({ id: arena.id, name: arena.name })),
    mapBanPools: mapBanPools.map((pool) => ({
      id: pool.id,
      name: pool.name,
      isActive: pool.isActive,
    })),
    playoffs: playoffs.map((playoff) => ({
      id: playoff.id,
      seasonId: playoff.seasonId,
      numRounds: playoff.numRounds,
      doubleElim: playoff.doubleElim,
    })),
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
  loadBoard: async ({ request, locals }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, loadBoardSchema);
    if (!validation.success) return validationError(validation.errors);
    const { regionId, divisionId, weekNo, isPlayoff, playoffRound } = validation.data;

    if (isPlayoff && playoffRound == null) {
      return formError('Playoff round is required');
    }
    if (!isPlayoff && (weekNo == null || weekNo < 1)) {
      return formError('Week number is required');
    }

    const resolved = await resolveCurrentSeason(regionId, divisionId);
    if (!resolved.ok) return formError(resolved.error);

    try {
      const board = await getSingleMatchBoard({
        regionId,
        divisionId,
        seasonId: resolved.seasonId,
        weekNo: isPlayoff ? undefined : weekNo,
        playoffRound: isPlayoff ? playoffRound : undefined,
      });
      return { board };
    } catch (err) {
      return fail(400, { error: getErrorMessage(err, 'Failed to load teams') });
    }
  },

  saveDraft: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);
    return saveOrPublish({ request, locals, getClientAddress, publish: false });
  },

  publishMatch: async ({ request, locals, getClientAddress }) => {
    requireStrictAdmin(locals.user);
    return saveOrPublish({ request, locals, getClientAddress, publish: true });
  },
};

async function saveOrPublish({
  request,
  locals,
  getClientAddress,
  publish,
}: {
  request: Request;
  locals: App.Locals;
  getClientAddress: () => string;
  publish: boolean;
}) {
  const formData = await request.formData();
  const validation = validateForm(formData, saveSingleMatchSchema);
  if (!validation.success) return validationError(validation.errors);
  const input = validation.data;

  if (input.homeTeamId === input.awayTeamId) {
    return formError('A team cannot play against itself');
  }
  if (
    input.boGames != null &&
    !seriesValues.includes(input.boGames as (typeof seriesValues)[number])
  ) {
    return formError('Best of games must be 1, 3, 5, or 7');
  }
  if (input.isPlayoff) {
    if (input.playoffRound == null) return formError('Playoff round is required');
    if (!input.mapBanPoolId) return formError('Map ban pool is required for playoff matches');
  } else if (input.weekNo == null || input.weekNo < 1) {
    return formError('Week number is required');
  }

  const resolved = await resolveCurrentSeason(input.regionId, input.divisionId);
  if (!resolved.ok) return formError(resolved.error);

  const season = await getSeasonById(resolved.seasonId);
  if (!season) return formError('Season not found');
  if (!input.isPlayoff && input.weekNo! > season.numWeeks) {
    return formError(`This season has ${season.numWeeks} weeks`);
  }

  let playoffId: number | undefined;
  if (input.isPlayoff) {
    const playoff = await getPlayoffBySeason(resolved.seasonId);
    if (!playoff) return formError('No playoff configuration found for this season');
    playoffId = playoff.id;
  }

  const user = locals.user;
  if (!user) return formError('You must be logged in', 401);

  try {
    await assertEligibleMatchTeams(
      input.regionId,
      input.divisionId,
      resolved.seasonId,
      input.homeTeamId,
      input.awayTeamId,
    );

    const draft = await saveMatchSetDraft({
      draftId: input.draftId,
      kind: 'SINGLE',
      regionId: input.regionId,
      divisionId: input.divisionId,
      seasonId: resolved.seasonId,
      seasonNo: season.seasonNum,
      weekNo: input.isPlayoff ? undefined : input.weekNo,
      boSeries: input.boSeries,
      boGames: input.boGames,
      arenaId: input.arenaId,
      matchDateTime: input.matchDateTime,
      matchTimezone: input.matchTimezone || undefined,
      mapBanPoolId: input.mapBanPoolId,
      isPlayoff: input.isPlayoff,
      playoffId,
      playoffRound: input.isPlayoff ? input.playoffRound : undefined,
      pairings: [{ homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId }],
      byeTeamIds: [],
      actorId: user.steamId,
    });

    if (!publish) {
      await logAudit({
        actorId: user.steamId,
        actorRole: user.permissionLevel,
        category: AuditCategory.MATCH,
        action: AuditAction.MATCH_SET_DRAFT_SAVED,
        targetType: 'MatchSetDraft',
        targetId: String(draft.id),
        metadata: {
          kind: 'SINGLE',
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          divisionId: draft.divisionId,
          weekNo: draft.weekNo,
          isPlayoff: draft.isPlayoff,
        },
        ipAddress: getClientAddress(),
      });
      throw redirect(303, `/admin/matches/drafts/${draft.id}`);
    }

    const published = await publishMatchSetDraft(draft.id, user.steamId);
    await logAudit({
      actorId: user.steamId,
      actorRole: user.permissionLevel,
      category: AuditCategory.MATCH,
      action: AuditAction.MATCH_SET_PUBLISHED,
      targetType: 'MatchSetDraft',
      targetId: String(draft.id),
      metadata: {
        kind: 'SINGLE',
        matchCount: published.matchCount,
        byesCleared: published.byesCleared,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        divisionId: draft.divisionId,
        weekNo: draft.weekNo,
        isPlayoff: draft.isPlayoff,
      },
      ipAddress: getClientAddress(),
    });
    throw redirect(303, `/admin/matches?created=${published.matchCount}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    return formError(
      getErrorMessage(err, publish ? 'Failed to publish match' : 'Failed to save draft'),
    );
  }
}
