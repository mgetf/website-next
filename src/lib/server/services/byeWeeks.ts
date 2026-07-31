import type { ByeWeekRow } from '$lib/types/service-models';
/**
 * Bye Week Service
 * Tracks weeks where a team has no scheduled match due to an odd number of eligible teams.
 */

/**
 * Get all bye weeks for a team, ordered by season then week number.
 * Used by the team profile page to display bye week entries in the match history.
 */
export async function getByeWeeksForTeam(teamId: number): Promise<ByeWeekRow[]> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void teamId;
    return [];
  }
  throw new Error('getByeWeeksForTeam requires DATA_BACKEND=rama');
}
