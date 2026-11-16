/**
 * Disputes Service
 *
 * All dispute-related business logic and database operations.
 */

import { prisma } from '#lib/server/db.js';
import { ForfeitType, MatchStatus } from '#prisma/client.js';
import { reversePlayedResult } from '#lib/server/services/forfeits.js';

/**
 * Get all disputed matches with team and season info
 */
export async function getDisputedMatches() {
  return await prisma.match.findMany({
    where: {
      status: MatchStatus.DISPUTE,
    },
    include: {
      homeTeam: {
        select: { id: true, name: true },
      },
      awayTeam: {
        select: { id: true, name: true },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
          region: {
            select: { name: true },
          },
        },
      },
      winner: {
        select: { id: true, name: true },
      },
    },
    orderBy: {
      id: 'desc',
    },
  });
}

/**
 * Resolve a dispute by updating match status
 *
 * Resolving to UNPLAYED must reverse the standings effects that
 * submitMatchScores already applied (W/L, games, points) and clear the
 * game scores, exactly like a reset to unplayed. Flipping only the
 * status left those increments in place, so a later resubmission
 * double-counted the win (e.g. a team showing 4-2 after playing 5
 * matches). PLAYED resolutions keep the existing result.
 */
export async function resolveDispute(matchId: number, newStatus: MatchStatus) {
  if (newStatus === MatchStatus.DISPUTE) {
    throw new Error('Cannot set status to DISPUTE');
  }

  return await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId } });
    if (!match) {
      throw new Error('Match not found');
    }

    if (newStatus === MatchStatus.UNPLAYED) {
      if (match.status === MatchStatus.UNPLAYED) {
        return match;
      }
      // Reverse the original submission's standings effects once.
      await reversePlayedResult(tx, match);
      return await tx.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.UNPLAYED,
          winnerId: null,
          winnerScore: null,
          loserScore: null,
          submittedBy: null,
          submittedAt: null,
          forfeitType: ForfeitType.NONE,
          forfeitWinnerId: null,
          forfeitTicketRef: null,
          forfeitApprovedBy: null,
          forfeitApprovedAt: null,
          forfeitReason: null,
        },
      });
    }

    return await tx.match.update({
      where: { id: matchId },
      data: { status: newStatus },
    });
  });
}
