/**
 * Disputes Service
 *
 * All dispute-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { MatchStatus } from '$prisma/client.js';

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
 */
export async function resolveDispute(matchId: number, newStatus: MatchStatus) {
  if (newStatus === MatchStatus.DISPUTE) {
    throw new Error('Cannot set status to DISPUTE');
  }

  return await prisma.match.update({
    where: { id: matchId },
    data: { status: newStatus },
  });
}
