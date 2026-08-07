/**
 * Match Management Service
 * Core business logic for league matches (2v2 and 1v1)
 */

import { prisma } from '$lib/server/db';
import type { Match, Game, Team } from '$prisma/client.js';
import { MatchStatus } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { calculateWeekLabel } from '$lib/server/utils/matchHelpers';
import {
  calculateMatchWinner,
  canUserManageMatch,
  validateScoreSubmission,
  type GameResult,
} from '$lib/server/utils/matchScoring';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { createNotificationForTeamOwners, createNotificationForAdmins } from './notifications';

export { calculateMatchWinner, canUserManageMatch, validateScoreSubmission };
export type { GameResult };

/**
 * Get complete match details with all relations
 */
export async function getMatchDetails(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: {
        include: {
          division: true,
          region: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      awayTeam: {
        include: {
          division: true,
          region: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      season: {
        include: {
          region: true,
        },
      },
      playoff: true,
      games: {
        include: {
          arena: true,
        },
        orderBy: { gameNum: 'asc' },
      },
      matchComms: {
        include: {
          user: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      matchMapBans: {
        include: {
          pool: {
            include: {
              mapsInPool: {
                include: {
                  arena: true,
                },
                orderBy: { orderNum: 'asc' },
              },
            },
          },
          actions: {
            include: {
              team: true,
              player: true,
              arena: true,
            },
            orderBy: { actionOrder: 'asc' },
          },
        },
      },
      demos: {
        include: {
          player: true,
          submitter: true,
        },
        orderBy: { submittedAt: 'desc' },
      },
      submitter: true,
    },
  });

  if (!match) {
    notFound('Match not found');
  }

  // Check if this is a 1v1 match and add player info
  const is1v1 = match.homeTeam.formatId === FORMAT_1V1;

  if (is1v1) {
    // Get the active player from each "team" (there should only be one)
    const homePlayer = match.homeTeam.players[0]?.player || null;
    const awayPlayer = match.awayTeam.players[0]?.player || null;

    return {
      ...match,
      is1v1: true,
      homePlayer,
      awayPlayer,
    };
  }

  return {
    ...match,
    is1v1: false,
    homePlayer: null,
    awayPlayer: null,
  };
}

/**
 * Calculate week label for a match by finding all matches for the HOME team in that week
 * Returns the label (e.g., "1", "1a", "1b") or null if no week number
 * Note: Label is calculated from home team's perspective for consistency
 */
export async function getMatchWeekLabel(match: Match): Promise<string | null> {
  if (match.weekNo === null || match.weekNo === undefined) {
    return null;
  }

  // Get all matches for the HOME team in this week
  // This ensures consistent labeling from one team's perspective
  const homeTeamMatchesForThisWeek = await prisma.match.findMany({
    where: {
      seasonId: match.seasonId,
      weekNo: match.weekNo,
      playoffId: null,
      OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  return calculateWeekLabel(match, homeTeamMatchesForThisWeek);
}

/**
 * Calculate week labels for multiple matches
 * More efficient than calling getMatchWeekLabel multiple times
 */
export async function getMatchWeekLabels(matches: Match[]): Promise<Map<number, string | null>> {
  const labels = new Map<number, string | null>();

  for (const match of matches) {
    const label = await getMatchWeekLabel(match);
    labels.set(match.id, label);
  }

  return labels;
}

/**
 * Submit match scores and update all related data
 */
export async function submitMatchScores(
  matchId: number,
  gameResults: GameResult[],
  submittedBy: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the match row for the duration of this transaction so concurrent
    // submissions cannot both pass the UNPLAYED check simultaneously.
    const rows = await tx.$queryRaw<{ id: number; status: string }[]>`
      SELECT id, status FROM matches WHERE id = ${matchId} FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) notFound('Match not found');
    if (locked.status !== 'UNPLAYED') {
      badRequest('Match scores have already been submitted');
    }

    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true, games: true },
    });

    if (!match) notFound('Match not found');

    const { winnerId, winnerScore, loserScore, homePointsScored, awayPointsScored } =
      calculateMatchWinner(match.homeTeamId, match.awayTeamId, gameResults, match.boGames);

    for (const r of gameResults) {
      await tx.game.updateMany({
        where: { matchId, gameNum: r.gameNum },
        data: {
          homeTeamScore: r.homeScore,
          awayTeamScore: r.awayScore,
          arenaId: r.arenaId || null,
        },
      });
    }

    await tx.team.update({
      where: { id: match.homeTeamId },
      data: {
        wins: { increment: winnerId === match.homeTeamId ? 1 : 0 },
        losses: { increment: winnerId === match.awayTeamId ? 1 : 0 },
        gamesWon: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
        gamesLost: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
        pointsScored: { increment: homePointsScored },
        pointsScoredAgainst: { increment: awayPointsScored },
      },
    });

    await tx.team.update({
      where: { id: match.awayTeamId },
      data: {
        wins: { increment: winnerId === match.awayTeamId ? 1 : 0 },
        losses: { increment: winnerId === match.homeTeamId ? 1 : 0 },
        gamesWon: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
        gamesLost: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
        pointsScored: { increment: awayPointsScored },
        pointsScoredAgainst: { increment: homePointsScored },
      },
    });

    await tx.match.update({
      where: { id: matchId },
      data: {
        winnerId,
        winnerScore,
        loserScore,
        status: MatchStatus.PLAYED,
        submittedBy,
        submittedAt: new Date(),
      },
    });

    await tx.matchComm.updateMany({
      where: { matchId, rescheduleStatus: 0 },
      data: { rescheduleStatus: 3 }, // Canceled
    });

    return {
      winnerId,
      winnerScore,
      loserScore,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    };
  });

  // Notifications run outside the transaction — non-critical side effects
  const submitterTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: submittedBy,
      teamId: { in: [result.homeTeamId, result.awayTeamId] },
      active: 1,
    },
  });

  if (submitterTeam) {
    const opposingTeamId =
      submitterTeam.teamId === result.homeTeamId ? result.awayTeamId : result.homeTeamId;

    await createNotificationForTeamOwners(
      [opposingTeamId],
      'MATCH_COMM',
      `/matches/${matchId}`,
      `Score submitted: ${result.winnerScore}-${result.loserScore}`,
      submittedBy,
    );
  }

  return {
    winnerId: result.winnerId,
    winnerScore: result.winnerScore,
    loserScore: result.loserScore,
  };
}

/**
 * File a match dispute
 * Must be within 24 hours of submission
 */
export async function disputeMatch(matchId: number, reason: string, disputedBy: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    notFound('Match not found');
  }

  if (match.status !== MatchStatus.PLAYED) {
    badRequest('Can only dispute played matches');
  }

  if (!match.submittedAt) {
    badRequest('No submission timestamp found');
  }

  const now = Date.now();
  const submittedTime = match.submittedAt.getTime();
  const hoursSinceSubmission = (now - submittedTime) / (1000 * 3600);

  if (hoursSinceSubmission > 24) {
    badRequest('Dispute period has passed (24 hours)');
  }

  // Update match status to DISPUTE
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: MatchStatus.DISPUTE,
    },
  });

  // Create dispute message
  await prisma.matchComm.create({
    data: {
      matchId,
      owner: disputedBy,
      content: `MATCH DISPUTED: ${reason}`,
      createdAt: new Date(),
    },
  });

  // Notify admins about the dispute
  await createNotificationForAdmins(
    'MATCH_COMM',
    `/matches/${matchId}`,
    `Match disputed: ${reason.substring(0, 50)}${reason.length > 50 ? '...' : ''}`,
    disputedBy,
  );

  // Determine which team the disputer is on to notify the opposing team
  const disputerTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: disputedBy,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
      active: 1,
    },
  });

  if (disputerTeam) {
    const opposingTeamId =
      disputerTeam.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    // Notify opposing team about the dispute
    await createNotificationForTeamOwners(
      [opposingTeamId],
      'MATCH_COMM',
      `/matches/${matchId}`,
      'Match has been disputed',
      disputedBy,
    );
  }
}
