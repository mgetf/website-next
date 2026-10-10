/**
 * Match set drafts — save pairings before they become public matches.
 * Moderators can create/update/discard drafts; publishing is admin-only
 * and is enforced at the route layer with requireStrictAdmin.
 */

import { prisma } from '#lib/server/db.js';
import { MatchSetDraftKind, MatchSetDraftStatus } from '#prisma/client.js';
import type { Prisma } from '#prisma/client.js';
import { badRequest, conflict, notFound } from '#lib/server/utils/errors.js';
import type {
  MatchSetDraftDetail,
  MatchSetDraftKind as MatchSetDraftKindName,
  MatchSetDraftListItem,
  MatchSetDraftPairingInput,
  MatchSetDraftTeam,
} from '#lib/types/matchSetDraft.js';
import {
  parseByeTeamIds,
  parseMatchSetPairings,
  validateMatchSetDraftTeams,
} from '#lib/utils/matchSetDraft.js';
import {
  assertEligibleMatchTeams,
  createMatchSet,
  createPlayoffMatch,
  createSingleRegularMatch,
} from './adminMatches';

export interface SaveMatchSetDraftInput {
  draftId?: number;
  kind?: MatchSetDraftKindName;
  regionId: number;
  divisionId: number;
  seasonId: number;
  seasonNo: number;
  weekNo?: number;
  boSeries: number;
  boGames?: number;
  arenaId?: number;
  matchDateTime?: string;
  matchTimezone?: string;
  mapBanPoolId?: number;
  isPlayoff: boolean;
  playoffId?: number;
  playoffRound?: number;
  pairings: MatchSetDraftPairingInput[];
  byeTeamIds: number[];
  actorId: string;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function requirePairings(raw: unknown): MatchSetDraftPairingInput[] {
  try {
    const pairings = parseMatchSetPairings(raw);
    return pairings;
  } catch (err) {
    badRequest(err instanceof Error ? err.message : 'Invalid pairings');
  }
}

function requireByeTeamIds(raw: unknown): number[] {
  try {
    return parseByeTeamIds(raw);
  } catch (err) {
    badRequest(err instanceof Error ? err.message : 'Invalid bye teams');
  }
}

function requireValidTeams(pairings: MatchSetDraftPairingInput[], byeTeamIds: number[]) {
  try {
    validateMatchSetDraftTeams(pairings, byeTeamIds);
  } catch (err) {
    badRequest(err instanceof Error ? err.message : 'Invalid match set teams');
  }
}

function seedTeams(teams: Omit<MatchSetDraftTeam, 'seed'>[]): Map<number, MatchSetDraftTeam> {
  const ranked = [...teams].sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });
  return new Map(ranked.map((team, index) => [team.id, { ...team, seed: index + 1 }]));
}

function placeholderTeam(id: number): MatchSetDraftTeam {
  return { id, name: `Unknown team #${id}`, acronym: null, wins: 0, losses: 0, seed: 0 };
}

const draftInclude = {
  region: { select: { id: true, name: true } },
  division: { select: { id: true, name: true, formatId: true } },
  season: {
    select: {
      id: true,
      seasonNum: true,
      formatId: true,
      format: { select: { name: true } },
    },
  },
  arena: { select: { id: true, name: true } },
  mapBanPool: { select: { id: true, name: true } },
  creator: { select: { steamUsername: true } },
} satisfies Prisma.MatchSetDraftInclude;

type DraftWithRelations = Prisma.MatchSetDraftGetPayload<{ include: typeof draftInclude }>;

async function mapDraftDetail(draft: DraftWithRelations): Promise<MatchSetDraftDetail> {
  const pairings = requirePairings(draft.pairings);
  const byeTeamIds = requireByeTeamIds(draft.byeTeamIds);
  const teamIds = [
    ...pairings.flatMap((pairing) => [pairing.homeTeamId, pairing.awayTeamId]),
    ...byeTeamIds,
  ];

  const teams = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, acronym: true, wins: true, losses: true },
      })
    : [];

  const byId = seedTeams(teams);

  let byesToClear: MatchSetDraftTeam[] = [];
  if (
    draft.kind === MatchSetDraftKind.SINGLE &&
    !draft.isPlayoff &&
    draft.weekNo != null &&
    pairings.length === 1
  ) {
    const pairedIds = [pairings[0].homeTeamId, pairings[0].awayTeamId];
    const byes = await prisma.byeWeek.findMany({
      where: { seasonId: draft.seasonId, weekNo: draft.weekNo, teamId: { in: pairedIds } },
      select: { teamId: true },
    });
    byesToClear = byes.map((bye) => byId.get(bye.teamId) ?? placeholderTeam(bye.teamId));
  }

  return {
    id: draft.id,
    kind: draft.kind,
    status: draft.status,
    regionId: draft.region.id,
    regionName: draft.region.name,
    divisionId: draft.division.id,
    divisionName: draft.division.name,
    formatId: draft.season.formatId,
    formatName: draft.season.format.name,
    seasonId: draft.season.id,
    seasonNo: draft.season.seasonNum,
    weekNo: draft.weekNo,
    boSeries: draft.boSeries,
    boGames: draft.boGames,
    arenaId: draft.arena?.id ?? null,
    arenaName: draft.arena?.name ?? null,
    matchDateTime: draft.matchDateTime ?? '',
    matchTimezone: draft.matchTimezone ?? 'UTC',
    mapBanPoolId: draft.mapBanPool?.id ?? null,
    mapBanPoolName: draft.mapBanPool?.name ?? null,
    isPlayoff: draft.isPlayoff,
    playoffId: draft.playoffId,
    playoffRound: draft.playoffRound,
    pairings: pairings.map((pairing) => ({
      home: byId.get(pairing.homeTeamId) ?? placeholderTeam(pairing.homeTeamId),
      away: byId.get(pairing.awayTeamId) ?? placeholderTeam(pairing.awayTeamId),
    })),
    byeTeams: byeTeamIds.map((id) => byId.get(id) ?? placeholderTeam(id)),
    byesToClear,
    createdByName: draft.creator.steamUsername,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

export async function listPendingMatchSetDrafts(): Promise<MatchSetDraftListItem[]> {
  const drafts = await prisma.matchSetDraft.findMany({
    where: { status: MatchSetDraftStatus.DRAFT },
    include: draftInclude,
    orderBy: { createdAt: 'desc' },
  });

  return drafts.map((draft) => {
    let matchCount = 0;
    try {
      matchCount = parseMatchSetPairings(draft.pairings).length;
    } catch {
      matchCount = 0;
    }
    return {
      id: draft.id,
      kind: draft.kind,
      isPlayoff: draft.isPlayoff,
      weekNo: draft.weekNo,
      playoffRound: draft.playoffRound,
      matchCount,
      regionName: draft.region.name,
      divisionName: draft.division.name,
      formatName: draft.season.format.name,
      seasonNo: draft.season.seasonNum,
      createdByName: draft.creator.steamUsername,
      createdAt: draft.createdAt.toISOString(),
    };
  });
}

export async function getMatchSetDraftDetail(id: number): Promise<MatchSetDraftDetail> {
  const draft = await prisma.matchSetDraft.findUnique({
    where: { id },
    include: draftInclude,
  });
  if (!draft) notFound('Match set draft not found');
  return mapDraftDetail(draft);
}

function requireSingleMatchShape(pairings: MatchSetDraftPairingInput[], byeTeamIds: number[]) {
  if (pairings.length !== 1) {
    badRequest('A single match draft needs exactly one pairing');
  }
  if (byeTeamIds.length > 0) {
    badRequest('A single match draft cannot assign byes');
  }
}

export async function saveMatchSetDraft(
  input: SaveMatchSetDraftInput,
): Promise<MatchSetDraftDetail> {
  requireValidTeams(input.pairings, input.byeTeamIds);

  const requestedKind = input.kind === 'SINGLE' ? MatchSetDraftKind.SINGLE : MatchSetDraftKind.SET;
  if (requestedKind === MatchSetDraftKind.SINGLE) {
    requireSingleMatchShape(input.pairings, input.byeTeamIds);
  }

  let kind = requestedKind;
  if (input.draftId) {
    const existing = await prisma.matchSetDraft.findUnique({
      where: { id: input.draftId },
      select: { id: true, status: true, kind: true },
    });
    if (!existing) notFound('Match set draft not found');
    if (existing.status !== MatchSetDraftStatus.DRAFT) {
      conflict('Only unpublished drafts can be changed');
    }
    if (input.kind && existing.kind !== requestedKind) {
      badRequest('Cannot change a draft between a week set and a single match');
    }
    kind = input.kind ? requestedKind : existing.kind;
    if (kind === MatchSetDraftKind.SINGLE) {
      requireSingleMatchShape(input.pairings, input.byeTeamIds);
    }
  }

  const data = {
    kind,
    regionId: input.regionId,
    divisionId: input.divisionId,
    seasonId: input.seasonId,
    seasonNo: input.seasonNo,
    weekNo: input.weekNo ?? null,
    boSeries: input.boSeries,
    boGames: input.boGames ?? null,
    arenaId: input.arenaId ?? null,
    matchDateTime: input.matchDateTime || null,
    matchTimezone: input.matchTimezone || null,
    mapBanPoolId: input.mapBanPoolId ?? null,
    isPlayoff: input.isPlayoff,
    playoffId: input.playoffId ?? null,
    playoffRound: input.playoffRound ?? null,
    pairings: asInputJson(input.pairings),
    byeTeamIds: asInputJson(input.byeTeamIds),
    updatedBy: input.actorId,
  };

  const draft = input.draftId
    ? await prisma.matchSetDraft.update({
        where: { id: await requireEditableDraftId(input.draftId) },
        data,
        include: draftInclude,
      })
    : await prisma.matchSetDraft.create({
        data: {
          ...data,
          createdBy: input.actorId,
        },
        include: draftInclude,
      });

  return mapDraftDetail(draft);
}

async function requireEditableDraftId(id: number): Promise<number> {
  const existing = await prisma.matchSetDraft.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) notFound('Match set draft not found');
  if (existing.status !== MatchSetDraftStatus.DRAFT) {
    conflict('Only unpublished drafts can be changed');
  }
  return existing.id;
}

export async function discardMatchSetDraft(id: number): Promise<void> {
  await prisma.matchSetDraft.update({
    where: { id: await requireEditableDraftId(id) },
    data: { status: MatchSetDraftStatus.DISCARDED },
  });
}

export async function publishMatchSetDraft(
  id: number,
  publisherId: string,
): Promise<{ matchCount: number; byeTeamCount: number; byesCleared: number }> {
  const draft = await prisma.matchSetDraft.findUnique({ where: { id } });
  if (!draft) notFound('Match set draft not found');
  if (draft.status !== MatchSetDraftStatus.DRAFT) {
    conflict('This match set has already been published or discarded');
  }

  const pairings = requirePairings(draft.pairings);

  let matchCount = 0;
  let byeTeamCount = 0;
  let byesCleared = 0;

  if (draft.kind === MatchSetDraftKind.SINGLE) {
    const byeTeamIds = requireByeTeamIds(draft.byeTeamIds);
    requireSingleMatchShape(pairings, byeTeamIds);
    const pairing = pairings[0];

    if (draft.isPlayoff) {
      if (!draft.playoffId || draft.playoffRound == null) {
        badRequest('Playoff ID and round are required to publish this draft');
      }
      await assertEligibleMatchTeams(
        draft.regionId,
        draft.divisionId,
        draft.seasonId,
        pairing.homeTeamId,
        pairing.awayTeamId,
      );
      await createPlayoffMatch({
        seasonId: draft.seasonId,
        seasonNo: draft.seasonNo,
        playoffId: draft.playoffId,
        playoffRound: draft.playoffRound,
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        boSeries: draft.boSeries,
        boGames: draft.boGames ?? undefined,
        arenaId: draft.arenaId ?? undefined,
        matchDateTime: draft.matchDateTime ?? undefined,
        matchTimezone: draft.matchTimezone ?? undefined,
        mapBanPoolId: draft.mapBanPoolId ?? undefined,
      });
      matchCount = 1;
    } else {
      if (draft.weekNo == null) {
        badRequest('Week number is required to publish this match');
      }
      const result = await createSingleRegularMatch({
        regionId: draft.regionId,
        divisionId: draft.divisionId,
        seasonId: draft.seasonId,
        seasonNo: draft.seasonNo,
        weekNo: draft.weekNo,
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        boSeries: draft.boSeries,
        arenaId: draft.arenaId ?? undefined,
        matchDateTime: draft.matchDateTime ?? undefined,
        matchTimezone: draft.matchTimezone ?? undefined,
        mapBanPoolId: draft.mapBanPoolId ?? undefined,
      });
      matchCount = 1;
      byesCleared = result.byesCleared;
    }
  } else if (draft.isPlayoff) {
    if (!draft.playoffId || draft.playoffRound == null) {
      badRequest('Playoff ID and round are required to publish this draft');
    }
    for (const pairing of pairings) {
      await createPlayoffMatch({
        seasonId: draft.seasonId,
        seasonNo: draft.seasonNo,
        playoffId: draft.playoffId,
        playoffRound: draft.playoffRound,
        homeTeamId: pairing.homeTeamId,
        awayTeamId: pairing.awayTeamId,
        boSeries: draft.boSeries,
        boGames: draft.boGames ?? undefined,
        arenaId: draft.arenaId ?? undefined,
        matchDateTime: draft.matchDateTime ?? undefined,
        matchTimezone: draft.matchTimezone ?? undefined,
        mapBanPoolId: draft.mapBanPoolId ?? undefined,
      });
      matchCount++;
    }
  } else {
    const result = await createMatchSet(draft.regionId, draft.divisionId, {
      seasonId: draft.seasonId,
      seasonNo: draft.seasonNo,
      weekNo: draft.weekNo ?? undefined,
      boSeries: draft.boSeries,
      arenaId: draft.arenaId ?? undefined,
      matchDateTime: draft.matchDateTime ?? undefined,
      matchTimezone: draft.matchTimezone ?? undefined,
      mapBanPoolId: draft.mapBanPoolId ?? undefined,
      manualPairings: pairings,
    });
    matchCount = result.matches.length;
    byeTeamCount = result.byeTeams.length;
  }

  await prisma.matchSetDraft.update({
    where: { id: draft.id },
    data: {
      status: MatchSetDraftStatus.PUBLISHED,
      publishedBy: publisherId,
      publishedAt: new Date(),
    },
  });

  return { matchCount, byeTeamCount, byesCleared };
}
