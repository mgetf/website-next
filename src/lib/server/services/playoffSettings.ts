import { prisma } from '#lib/server/db.js';
import { badRequest, notFound } from '#lib/server/utils/errors.js';
import { MatchStatus } from '#prisma/client.js';
import type { Prisma } from '#prisma/client.js';

export const PLAYOFF_LENGTHS = [1, 3, 5, 7] as const;

function isPlayoffLength(length: number): boolean {
  return (PLAYOFF_LENGTHS as readonly number[]).includes(length);
}

export type PlayoffBracketPoolSummary = {
  id: number;
  name: string;
  matchCount: number;
  unplayedCount: number;
};

export type PlayoffBracketSettings = {
  seasonId: number;
  seasonNum: number;
  regionName: string;
  formatName: string;
  divisionId: number;
  divisionName: string;
  format: string;
  /** Saved lengths for future bracket creation. */
  series: number;
  arenaGames: number;
  slotCount: number;
  matchCount: number;
  playedCount: number;
  unplayedCount: number;
  /** Effective pools actually bound to this bracket's matches. */
  pools: PlayoffBracketPoolSummary[];
  /** Any match has ban/pick actions (a pool flip would have to reset its ban phase). */
  hasBanActions: boolean;
  /** Any match already completed its ban phase. */
  hasCompletedBan: boolean;
};

/** Bracket matches as needed for the settings guards. */
export type SettingsMatch = {
  id: number;
  status: MatchStatus;
  banActionCount: number;
  banPhaseComplete: boolean;
};

/**
 * Why a length change is refused, or null when it can go ahead. Played
 * matches keep their recorded results, and matches whose ban/pick has started
 * cannot have their game slots rebuilt under them.
 */
export function boResizeBlocker(matches: SettingsMatch[]): string | null {
  if (matches.some((match) => match.status !== MatchStatus.UNPLAYED)) {
    return 'Some matches in this bracket already have reported scores, so their lengths cannot change. Delete the bracket first if you want to start over.';
  }
  if (matches.some((match) => match.banActionCount > 0)) {
    return 'Map ban/pick has already started in this bracket, so the lengths cannot change.';
  }
  return null;
}

/** Split a bracket's matches into pool-flip targets and matches to keep as-is. */
export function splitPoolTargets(matches: SettingsMatch[]): {
  flip: number[];
  kept: number[];
} {
  const flip: number[] = [];
  const kept: number[] = [];
  for (const match of matches) {
    if (match.status === MatchStatus.UNPLAYED && !match.banPhaseComplete) {
      flip.push(match.id);
    } else {
      kept.push(match.id);
    }
  }
  return { flip, kept };
}

/** Every generated bracket with the settings an admin can see and change. */
export async function listPlayoffBracketSettings(): Promise<PlayoffBracketSettings[]> {
  const brackets = await prisma.playoffSlot.groupBy({
    by: ['seasonId', 'divisionId'],
    _count: { _all: true },
  });
  if (brackets.length === 0) return [];

  const seasonIds = [...new Set(brackets.map((bracket) => bracket.seasonId))];
  const seasons = await prisma.season.findMany({
    where: { id: { in: seasonIds } },
    select: {
      id: true,
      seasonNum: true,
      region: { select: { name: true } },
      format: { select: { name: true } },
    },
  });
  const seasonById = new Map(seasons.map((season) => [season.id, season]));

  const divisionIds = [...new Set(brackets.map((bracket) => bracket.divisionId))];
  const divisions = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    select: { id: true, name: true },
  });
  const divisionById = new Map(divisions.map((division) => [division.id, division]));

  const choices = await prisma.seasonDivisionPlayoff.findMany({
    where: { seasonId: { in: seasonIds }, divisionId: { in: divisionIds } },
    select: { seasonId: true, divisionId: true, format: true, series: true, arenaGames: true },
  });
  const choiceByKey = new Map(
    choices.map((choice) => [`${choice.seasonId}:${choice.divisionId}`, choice]),
  );

  const linked = await prisma.playoffSlot.findMany({
    where: { matchId: { not: null } },
    select: { seasonId: true, divisionId: true, matchId: true },
  });

  const details = await summarizeMatches(linked.map((slot) => slot.matchId as number));

  return brackets.map((bracket) => {
    const season = seasonById.get(bracket.seasonId);
    const division = divisionById.get(bracket.divisionId);
    const choice = choiceByKey.get(`${bracket.seasonId}:${bracket.divisionId}`);
    const state = summarizeBracket(
      linked
        .filter(
          (slot) => slot.seasonId === bracket.seasonId && slot.divisionId === bracket.divisionId,
        )
        .map((slot) => slot.matchId as number),
      details,
    );
    return {
      seasonId: bracket.seasonId,
      seasonNum: season?.seasonNum ?? 0,
      regionName: season?.region.name ?? '',
      formatName: season?.format.name ?? '',
      divisionId: bracket.divisionId,
      divisionName: division?.name ?? '',
      format: choice?.format ?? '',
      series: choice?.series ?? 0,
      arenaGames: choice?.arenaGames ?? 0,
      slotCount: bracket._count._all,
      matchCount: state.matchCount,
      playedCount: state.playedCount,
      unplayedCount: state.unplayedCount,
      pools: state.pools,
      hasBanActions: state.hasBanActions,
      hasCompletedBan: state.hasCompletedBan,
    };
  });
}

type MatchDetails = {
  status: MatchStatus;
  boSeries: number | null;
  boGames: number | null;
  poolId: number | null;
  poolName: string | null;
  banActionCount: number;
  banPhaseComplete: boolean;
};

async function summarizeMatches(matchIds: number[]): Promise<Map<number, MatchDetails>> {
  const details = new Map<number, MatchDetails>();
  if (matchIds.length === 0) return details;

  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
    select: { id: true, status: true, boSeries: true, boGames: true },
  });
  const bans = await prisma.matchMapBan.findMany({
    where: { matchId: { in: matchIds } },
    select: {
      matchId: true,
      poolId: true,
      banPhaseComplete: true,
      pool: { select: { name: true } },
      _count: { select: { actions: true } },
    },
  });
  const banByMatch = new Map(bans.map((ban) => [ban.matchId, ban]));

  for (const match of matches) {
    const ban = banByMatch.get(match.id);
    details.set(match.id, {
      status: match.status,
      boSeries: match.boSeries,
      boGames: match.boGames,
      poolId: ban?.poolId ?? null,
      poolName: ban?.pool?.name ?? null,
      banActionCount: ban?._count.actions ?? 0,
      banPhaseComplete: ban?.banPhaseComplete ?? false,
    });
  }
  return details;
}

function summarizeBracket(matchIds: number[], details: Map<number, MatchDetails>) {
  const pools = new Map<
    number,
    { id: number; name: string; matchCount: number; unplayedCount: number }
  >();
  let playedCount = 0;
  let unplayedCount = 0;
  let hasBanActions = false;
  let hasCompletedBan = false;

  for (const matchId of matchIds) {
    const detail = details.get(matchId);
    if (!detail) continue;
    if (detail.status === MatchStatus.UNPLAYED) unplayedCount += 1;
    else playedCount += 1;
    if (detail.banActionCount > 0) hasBanActions = true;
    if (detail.banPhaseComplete) hasCompletedBan = true;
    if (detail.poolId != null) {
      const pool = pools.get(detail.poolId) ?? {
        id: detail.poolId,
        name: detail.poolName ?? `Pool ${detail.poolId}`,
        matchCount: 0,
        unplayedCount: 0,
      };
      pool.matchCount += 1;
      if (detail.status === MatchStatus.UNPLAYED) pool.unplayedCount += 1;
      pools.set(detail.poolId, pool);
    }
  }

  return {
    matchCount: matchIds.length,
    playedCount,
    unplayedCount,
    pools: [...pools.values()].sort((a, b) => a.id - b.id),
    hasBanActions,
    hasCompletedBan,
  };
}

export type BracketSettingsUpdateResult = {
  seriesChangedMatches: number;
  poolChangedMatches: number;
  keptPoolMatches: number;
};

/**
 * Change a generated bracket's saved lengths and/or map pool.
 *
 * Lengths are applied to the saved choice and to every still-unplayed match
 * (game slots are rebuilt). This refuses when any match already has a score
 * or a started ban phase. The pool is flipped only on matches whose ban phase
 * has not finished; their ban/pick actions are reset. Finished matches keep
 * their pool and results.
 */
export async function updatePlayoffBracketSettings(
  seasonId: number,
  divisionId: number,
  changes: { series?: number; arenaGames?: number; mapBanPoolId?: number },
): Promise<BracketSettingsUpdateResult> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { regionId: true, formatId: true },
  });
  if (!season) notFound('Season not found');

  const division = await prisma.division.findFirst({
    where: { id: divisionId, regionId: season.regionId, formatId: season.formatId },
    select: { id: true },
  });
  if (!division) badRequest('That division is not part of this season');

  const choice = await prisma.seasonDivisionPlayoff.findUnique({
    where: { seasonId_divisionId: { seasonId, divisionId } },
    select: { series: true, arenaGames: true },
  });
  if (!choice) badRequest('This division has no saved playoff choice to update');

  const nextSeries = changes.series ?? choice.series;
  const nextArenaGames = changes.arenaGames ?? choice.arenaGames;
  if (!isPlayoffLength(nextSeries) || !isPlayoffLength(nextArenaGames)) {
    badRequest('Choose a series and an arena length of 1, 3, 5, or 7');
  }

  let pool: { id: number; isActive: boolean; _count: { mapsInPool: number } } | null = null;
  if (changes.mapBanPoolId != null) {
    pool = await prisma.mapBanPool.findUnique({
      where: { id: changes.mapBanPoolId },
      select: { id: true, isActive: true, _count: { select: { mapsInPool: true } } },
    });
    if (!pool || !pool.isActive) badRequest('Choose an active map ban pool');
    if (pool._count.mapsInPool === 0) badRequest('That map ban pool has no maps');
  }

  const slots = await prisma.playoffSlot.findMany({
    where: { seasonId, divisionId },
    select: { matchId: true },
  });
  if (slots.length === 0) badRequest('This division has no playoff bracket to update');

  const matchIds = [
    ...new Set(slots.flatMap((slot) => (slot.matchId != null ? [slot.matchId] : []))),
  ];
  const details = await summarizeMatches(matchIds);
  const matches: SettingsMatch[] = matchIds.flatMap((matchId) => {
    const detail = details.get(matchId);
    return detail
      ? [
          {
            id: matchId,
            status: detail.status,
            banActionCount: detail.banActionCount,
            banPhaseComplete: detail.banPhaseComplete,
          },
        ]
      : [];
  });

  const lengthsDiffer = nextSeries !== choice.series || nextArenaGames !== choice.arenaGames;
  const poolDiffers =
    pool != null &&
    matches.some((match) => {
      const detail = details.get(match.id);
      return detail != null && detail.poolId != null && detail.poolId !== pool.id;
    });

  if (lengthsDiffer) {
    const blocker = boResizeBlocker(matches);
    if (blocker) badRequest(blocker);
  }

  const { flip: poolTargets, kept: keptPool } = poolDiffers
    ? splitPoolTargets(matches)
    : {
        flip: [] as number[],
        kept: [] as number[],
      };

  let seriesChangedMatches = 0;

  await prisma.$transaction(async (tx) => {
    if (lengthsDiffer) {
      await tx.seasonDivisionPlayoff.update({
        where: { seasonId_divisionId: { seasonId, divisionId } },
        data: { series: nextSeries, arenaGames: nextArenaGames },
      });

      const totalGames = nextSeries * nextArenaGames;
      for (const match of matches) {
        await tx.match.update({
          where: { id: match.id },
          data: { boSeries: nextSeries, boGames: nextArenaGames },
        });
        await tx.game.deleteMany({ where: { matchId: match.id } });
        await tx.game.createMany({
          data: Array.from({ length: totalGames }, (_, index) => ({
            matchId: match.id,
            gameNum: index + 1,
          })),
        });
        seriesChangedMatches += 1;
      }
    }

    if (poolDiffers && poolTargets.length > 0) {
      await tx.mapBanAction.deleteMany({
        where: {
          matchMapBan: { matchId: { in: poolTargets } },
        },
      });
      await tx.matchMapBan.updateMany({
        where: { matchId: { in: poolTargets } },
        data: { poolId: pool?.id, currentTurn: 1, banPhaseComplete: false },
      });

      const withoutBan = await tx.match.findMany({
        where: { id: { in: poolTargets }, matchMapBans: { none: {} } },
        select: { id: true },
      });
      if (withoutBan.length > 0 && pool) {
        await tx.matchMapBan.createMany({
          data: withoutBan.map((match) => ({
            matchId: match.id,
            poolId: pool.id,
            currentTurn: 1,
            banPhaseComplete: false,
          })),
        });
      }
    }
  });

  return {
    seriesChangedMatches,
    poolChangedMatches: poolTargets.length,
    keptPoolMatches: keptPool.length,
  };
}
