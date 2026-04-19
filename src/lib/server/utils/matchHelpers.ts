/**
 * Match Helper Utilities
 * Utility functions for match management
 */

import type { Match } from '$prisma/client.js';

/**
 * Calculate week label with suffix for multi-match weeks (e.g., "1a", "1b")
 * @param match - The current match
 * @param siblingsInWeek - All matches in the same week (MUST be filtered by division/region already)
 * @returns Week label with suffix if multiple matches, null if no week
 */
export function calculateWeekLabel(match: Match, siblingsInWeek: { id: number }[]): string | null {
  if (match.weekNo === null || match.weekNo === undefined) {
    return null;
  }

  // If only 1 match in the week, no suffix needed
  if (siblingsInWeek.length <= 1) {
    return match.weekNo.toString();
  }

  const idx = siblingsInWeek.findIndex((m) => m.id === match.id);
  if (idx < 0) {
    // Match not found in siblings (shouldn't happen), just return week number
    return match.weekNo.toString();
  }

  // Multiple matches in week - add letter suffix (a, b, c...)
  const suffixChar = String.fromCharCode('a'.charCodeAt(0) + idx);
  return `${match.weekNo}${suffixChar}`;
}

/**
 * Convert a naive local datetime string (e.g. "2026-04-20T18:00") from a given IANA timezone
 * to the equivalent UTC Date.
 *
 * Works by computing the UTC offset that the target timezone applies at the requested moment
 * and adjusting accordingly. DST edge cases are handled within ±1 ms.
 */
export function localDatetimeToUtc(naiveDatetime: string, ianaTimezone: string): Date {
  const normalized = naiveDatetime.length === 16 ? naiveDatetime + ':00' : naiveDatetime;

  const roughUtc = new Date(normalized + 'Z');

  const localAtRoughUtc = new Intl.DateTimeFormat('sv', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(roughUtc)
    .replace(' ', 'T');

  const desiredLocal = new Date(normalized + 'Z');
  const actualLocal = new Date(localAtRoughUtc + 'Z');
  const diff = desiredLocal.getTime() - actualLocal.getTime();

  return new Date(roughUtc.getTime() + diff);
}

/**
 * Check if a match can be disputed
 * Must be within 24 hours of submission and status must be PLAYED
 * @param match - Match to check
 * @returns True if dispute is allowed
 */
export function canDisputeMatch(match: Match): boolean {
  if (match.status !== 'PLAYED') return false;
  if (!match.submittedAt) return false;

  const now = Date.now();
  const submittedTime = match.submittedAt.getTime();
  const hoursSinceSubmission = (now - submittedTime) / (1000 * 3600);

  return hoursSinceSubmission < 24;
}

/**
 * Calculate win/loss ratio
 * @param wins - Number of wins
 * @param losses - Number of losses
 * @returns Win/loss ratio
 */
export function calculateWinLossRatio(wins: number, losses: number): number {
  if (losses === 0) return wins;
  return wins / (wins + losses);
}

/**
 * Calculate points per game
 * @param pointsScored - Total points scored
 * @param gamesWon - Games won
 * @param gamesLost - Games lost
 * @returns Points per game average
 */
export function calculatePointsPerGame(
  pointsScored: number,
  gamesWon: number,
  gamesLost: number,
): number {
  const totalGames = gamesWon + gamesLost;
  if (totalGames === 0) return 0;
  return pointsScored / totalGames;
}
