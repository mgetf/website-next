/**
 * Bye Week Service
 * Tracks weeks where a team has no scheduled match due to an odd number of eligible teams.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all bye weeks for a team, ordered by season then week number.
 * Used by the team profile page to display bye week entries in the match history.
 */
export async function getByeWeeksForTeam(teamId: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void teamId;
    return [];
  }

  return await prisma.byeWeek.findMany({
    where: { teamId },
    include: {
      season: {
        select: { id: true, seasonNum: true, regionId: true },
      },
    },
    orderBy: [{ season: { seasonNum: 'desc' } }, { weekNo: 'asc' }],
  });
}
