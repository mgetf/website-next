import { prisma } from '#lib/server/db.js';
import { badRequest, conflict, notFound } from '#lib/server/utils/errors.js';
import {
  buildPlayoffBracket,
  rankPlayoffField,
  type PlayoffBracketFormat,
  type PlayoffSlotDraft,
} from '#lib/server/utils/playoffBracket.js';
import {
  planPlayoffAdvance,
  PlayoffAdvanceError,
  type AdvanceSection,
  type AdvanceSlot,
} from '#lib/server/utils/playoffAdvance.js';
import { planPlayoffPodium } from '#lib/server/utils/playoffPodium.js';
import { saveDivisionPlayoffPlacements } from '#lib/server/services/playoffPlacements.js';
import { createNotificationForRoster } from '#lib/server/services/notifications.js';
import { BracketSection, MatchStatus, PlayoffFormat, Prisma, TeamStatus } from '#prisma/client.js';
import { formatPlayoffSlotLabel, type PlayoffSlotSection } from '#lib/utils/playoffs.js';

const PLAYOFF_SERIES = 3;
const PLAYOFF_GAMES_PER_ARENA = 3;

function isPlayoffLength(length: number): boolean {
  return length === 3 || length === 5 || length === 7;
}

export type GeneratedPlayoffBracket = {
  divisionId: number;
  divisionName: string;
  format: PlayoffBracketFormat;
  teamCount: number;
  slotCount: number;
  matchCount: number;
};

/** Round name for a playoff match created from a slot, or null when the match is not one. */
export async function getPlayoffMatchLabel(matchId: number): Promise<string | null> {
  const slot = await prisma.playoffSlot.findUnique({
    where: { matchId },
    select: { section: true, round: true, seasonId: true, divisionId: true },
  });
  if (!slot) return null;

  const highest = await prisma.playoffSlot.aggregate({
    where: {
      seasonId: slot.seasonId,
      divisionId: slot.divisionId,
      section: slot.section,
    },
    _max: { round: true },
  });

  return formatPlayoffSlotLabel(
    slot.section as PlayoffSlotSection,
    slot.round,
    highest._max.round ?? slot.round,
  );
}

/** Divisions that already have a generated playoff tree. */
export async function listGeneratedPlayoffDivisions(): Promise<
  Array<{ seasonId: number; divisionId: number }>
> {
  return prisma.playoffSlot.findMany({
    distinct: ['seasonId', 'divisionId'],
    select: { seasonId: true, divisionId: true },
  });
}

/**
 * Fill one division's playoff tree from the teams that have not withdrawn.
 * Slots that already have both teams become real matches. The series length and
 * the games on each arena are the ones saved for that division. Later slots stay
 * empty and keep their arrows.
 */
export async function generateDivisionPlayoffBracket(
  seasonId: number,
  divisionId: number,
  mapBanPoolId: number,
): Promise<GeneratedPlayoffBracket> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, seasonNum: true, regionId: true, formatId: true },
  });
  if (!season) notFound('Season not found');

  const division = await prisma.division.findFirst({
    where: { id: divisionId, regionId: season.regionId, formatId: season.formatId },
    select: { id: true, name: true },
  });
  if (!division) badRequest('That division is not part of this season');

  const choice = await prisma.seasonDivisionPlayoff.findUnique({
    where: { seasonId_divisionId: { seasonId, divisionId } },
    select: { format: true, series: true, arenaGames: true },
  });
  if (!choice) badRequest('Choose a playoff format for this division before generating it');
  if (!isPlayoffLength(choice.series) || !isPlayoffLength(choice.arenaGames)) {
    badRequest('Choose a series and an arena length of 3, 5, or 7 before generating');
  }

  const existing = await prisma.playoffSlot.count({ where: { seasonId, divisionId } });
  if (existing > 0) conflict('This division already has a playoff bracket');

  const pool = await prisma.mapBanPool.findUnique({
    where: { id: mapBanPoolId },
    select: { id: true, isActive: true, _count: { select: { mapsInPool: true } } },
  });
  if (!pool || !pool.isActive) badRequest('Choose an active map ban pool');
  if (pool._count.mapsInPool === 0) badRequest('That map ban pool has no maps');

  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      divisionId,
      regionId: season.regionId,
      formatId: season.formatId,
      status: { not: TeamStatus.DEAD },
    },
    select: {
      id: true,
      status: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
    },
  });

  const ranked = rankPlayoffField(
    teams.map((team) => {
      const played = team.gamesWon + team.gamesLost;
      return {
        id: team.id,
        status: team.status,
        wins: team.wins,
        losses: team.losses,
        points: played > 0 ? team.pointsScored / played : 0,
      };
    }),
  );
  if (ranked.length < 2) {
    badRequest('This division needs at least two teams that have not withdrawn');
  }

  const format: PlayoffBracketFormat =
    choice.format === PlayoffFormat.DOUBLE_ELIM ? 'DOUBLE_ELIM' : 'SINGLE_ELIM';
  const drafts = buildPlayoffBracket(format, ranked);
  const createdMatches = await persistBracket({
    seasonId,
    seasonNo: season.seasonNum,
    divisionId,
    format: choice.format,
    mapBanPoolId,
    boSeries: choice.series,
    boGames: choice.arenaGames,
    drafts,
  });

  for (const match of createdMatches) {
    await createNotificationForRoster(
      [match.homeTeamId, match.awayTeamId],
      'MATCH_CREATED',
      `/matches/${match.id}`,
      `New playoff match scheduled: ${division.name}`,
    );
  }

  return {
    divisionId,
    divisionName: division.name,
    format,
    teamCount: ranked.length,
    slotCount: drafts.length,
    matchCount: createdMatches.length,
  };
}

async function persistBracket(input: {
  seasonId: number;
  seasonNo: number;
  divisionId: number;
  format: PlayoffFormat;
  mapBanPoolId: number;
  boSeries: number;
  boGames: number;
  drafts: PlayoffSlotDraft[];
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.playoffSlot.createManyAndReturn({
      data: input.drafts.map((draft) => ({
        seasonId: input.seasonId,
        divisionId: input.divisionId,
        format: input.format,
        section: BracketSection[draft.section],
        round: draft.round,
        position: draft.position,
        team1Id: draft.team1Id,
        team2Id: draft.team2Id,
        isBye: draft.isBye,
      })),
    });

    const byKey = new Map(
      created.map((row) => [`${row.section}-${row.round}-${row.position}`, row]),
    );

    for (const draft of input.drafts) {
      const row = byKey.get(draft.key);
      if (!row) badRequest('Playoff bracket could not be saved');
      const winner = draft.winnerNextKey ? byKey.get(draft.winnerNextKey) : null;
      const loser = draft.loserNextKey ? byKey.get(draft.loserNextKey) : null;
      await tx.playoffSlot.update({
        where: { id: row.id },
        data: {
          winnerNextSlotId: winner?.id ?? null,
          winnerNextSide: draft.winnerNextSide,
          loserNextSlotId: loser?.id ?? null,
          loserNextSide: draft.loserNextSide,
        },
      });
    }

    const matches: Array<{ id: number; homeTeamId: number; awayTeamId: number }> = [];
    for (const draft of input.drafts) {
      if (draft.isBye || draft.team1Id == null || draft.team2Id == null) continue;
      const row = byKey.get(draft.key);
      if (!row) continue;
      const match = await insertPlayoffMatch(tx, {
        seasonId: input.seasonId,
        seasonNo: input.seasonNo,
        homeTeamId: draft.team1Id,
        awayTeamId: draft.team2Id,
        boSeries: input.boSeries,
        boGames: input.boGames,
        mapBanPoolId: input.mapBanPoolId,
      });
      await tx.playoffSlot.update({
        where: { id: row.id },
        data: { matchId: match.id },
      });
      matches.push({ id: match.id, homeTeamId: draft.team1Id, awayTeamId: draft.team2Id });
    }

    return matches;
  });
}

export type AdvancedPlayoffMatch = {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  divisionName: string;
};

/**
 * Move the winner and loser of a played match along that slot's arrows.
 * Creates the next match when a slot ends up with both teams, including the
 * grand-final reset when the losers champion wins.
 */
export async function advancePlayoffFromMatch(
  tx: Prisma.TransactionClient,
  matchId: number,
): Promise<AdvancedPlayoffMatch[]> {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      winnerId: true,
      status: true,
      seasonId: true,
      seasonNo: true,
      boSeries: true,
      boGames: true,
    },
  });
  if (!match || match.status !== MatchStatus.PLAYED) return [];

  const source = await tx.playoffSlot.findUnique({ where: { matchId } });
  if (!source) return [];
  if (match.winnerId == null) badRequest('A playoff match needs a winner');

  await tx.$queryRaw`
    SELECT id FROM playoff_slots
    WHERE season_id = ${source.seasonId} AND division_id = ${source.divisionId}
    FOR UPDATE
  `;

  const rows = await tx.playoffSlot.findMany({
    where: { seasonId: source.seasonId, divisionId: source.divisionId },
  });
  const division = await tx.division.findUnique({
    where: { id: source.divisionId },
    select: { name: true },
  });
  const divisionName = division?.name ?? 'Playoffs';
  const pool = await tx.matchMapBan.findFirst({
    where: { matchId },
    select: { poolId: true },
  });

  let plan;
  try {
    plan = planPlayoffAdvance(rows.map(toAdvanceSlot), source.id, match.winnerId);
  } catch (err) {
    if (err instanceof PlayoffAdvanceError) conflict(err.message);
    throw err;
  }

  for (const update of plan.updates) {
    await tx.playoffSlot.update({
      where: { id: update.slotId },
      data: {
        team1Id: update.team1Id,
        team2Id: update.team2Id,
        isBye: update.isBye,
        ...(update.clearLoserArrow ? { loserNextSlotId: null, loserNextSide: null } : {}),
      },
    });
  }

  const created: AdvancedPlayoffMatch[] = [];
  const series = match.boSeries && match.boSeries > 0 ? match.boSeries : PLAYOFF_SERIES;
  const gamesPerArena =
    match.boGames && match.boGames > 0 ? match.boGames : PLAYOFF_GAMES_PER_ARENA;

  for (const next of plan.matches) {
    const createdMatch = await insertPlayoffMatch(tx, {
      seasonId: match.seasonId,
      seasonNo: match.seasonNo,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      boSeries: series,
      boGames: gamesPerArena,
      mapBanPoolId: pool?.poolId ?? null,
    });
    await tx.playoffSlot.update({
      where: { id: next.slotId },
      data: { matchId: createdMatch.id },
    });
    created.push({
      id: createdMatch.id,
      homeTeamId: next.homeTeamId,
      awayTeamId: next.awayTeamId,
      divisionName,
    });
  }

  if (plan.reset) {
    const resetSlot = await tx.playoffSlot.create({
      data: {
        seasonId: source.seasonId,
        divisionId: source.divisionId,
        format: source.format,
        section: BracketSection.GRAND_FINAL,
        round: 2,
        position: 1,
        team1Id: plan.reset.team1Id,
        team2Id: plan.reset.team2Id,
        isBye: false,
      },
    });
    const resetMatch = await insertPlayoffMatch(tx, {
      seasonId: match.seasonId,
      seasonNo: match.seasonNo,
      homeTeamId: plan.reset.team1Id,
      awayTeamId: plan.reset.team2Id,
      boSeries: series,
      boGames: gamesPerArena,
      mapBanPoolId: pool?.poolId ?? null,
    });
    await tx.playoffSlot.update({
      where: { id: resetSlot.id },
      data: { matchId: resetMatch.id },
    });
    created.push({
      id: resetMatch.id,
      homeTeamId: plan.reset.team1Id,
      awayTeamId: plan.reset.team2Id,
      divisionName,
    });
  }

  const refreshed = await tx.playoffSlot.findMany({
    where: { seasonId: source.seasonId, divisionId: source.divisionId },
    include: { match: { select: { winnerId: true, status: true } } },
  });
  await saveDivisionPlayoffPlacements(
    tx,
    source.seasonId,
    source.divisionId,
    planPlayoffPodium(
      refreshed.map((row) => ({
        id: row.id,
        format: row.format === PlayoffFormat.DOUBLE_ELIM ? 'DOUBLE_ELIM' : 'SINGLE_ELIM',
        section: row.section as AdvanceSection,
        round: row.round,
        position: row.position,
        team1Id: row.team1Id,
        team2Id: row.team2Id,
        isBye: row.isBye,
        winnerNextSlotId: row.winnerNextSlotId,
        winnerId: row.match?.status === MatchStatus.PLAYED ? row.match.winnerId : null,
      })),
    ),
  );

  return created;
}

export async function notifyNewPlayoffMatches(matches: AdvancedPlayoffMatch[]) {
  for (const match of matches) {
    await createNotificationForRoster(
      [match.homeTeamId, match.awayTeamId],
      'MATCH_CREATED',
      `/matches/${match.id}`,
      `New playoff match scheduled: ${match.divisionName}`,
    );
  }
}

function toAdvanceSlot(row: {
  id: number;
  section: BracketSection;
  round: number;
  position: number;
  team1Id: number | null;
  team2Id: number | null;
  winnerNextSlotId: number | null;
  winnerNextSide: number | null;
  loserNextSlotId: number | null;
  loserNextSide: number | null;
  matchId: number | null;
  isBye: boolean;
}): AdvanceSlot {
  return {
    id: row.id,
    section: row.section as AdvanceSection,
    round: row.round,
    position: row.position,
    team1Id: row.team1Id,
    team2Id: row.team2Id,
    winnerNextSlotId: row.winnerNextSlotId,
    winnerNextSide: arrowSide(row.winnerNextSide),
    loserNextSlotId: row.loserNextSlotId,
    loserNextSide: arrowSide(row.loserNextSide),
    hasMatch: row.matchId != null,
    isBye: row.isBye,
  };
}

function arrowSide(side: number | null): 1 | 2 | null {
  if (side == null) return null;
  if (side === 1 || side === 2) return side;
  throw new PlayoffAdvanceError('Playoff arrow has an invalid side');
}

async function insertPlayoffMatch(
  tx: Prisma.TransactionClient,
  input: {
    seasonId: number;
    seasonNo: number;
    homeTeamId: number;
    awayTeamId: number;
    boSeries: number;
    boGames: number;
    mapBanPoolId: number | null;
  },
) {
  const match = await tx.match.create({
    data: {
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      seasonId: input.seasonId,
      seasonNo: input.seasonNo,
      weekNo: null,
      playoffId: null,
      playoffRound: null,
      boSeries: input.boSeries,
      boGames: input.boGames,
      status: MatchStatus.UNPLAYED,
    },
  });
  const totalGames = input.boSeries * input.boGames;
  await tx.game.createMany({
    data: Array.from({ length: totalGames }, (_, index) => ({
      matchId: match.id,
      gameNum: index + 1,
    })),
  });
  if (input.mapBanPoolId) {
    await tx.matchMapBan.create({
      data: {
        matchId: match.id,
        poolId: input.mapBanPoolId,
        currentTurn: 1,
        banPhaseComplete: false,
      },
    });
  }
  return match;
}
