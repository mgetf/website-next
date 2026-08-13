// Formats a league playoff round number into a human-readable label.
//
// League playoff rounds are encoded by sign:
//   - positive values are winners (upper) bracket rounds
//   - negative values are losers (lower) bracket rounds (displayed via absolute value)
//
// Round numbers are shown verbatim (e.g. "Upper Round 1", "Lower Round 2") rather
// than named stages like "Semifinal"/"Final", because the same round number maps to
// different stages depending on the bracket size and format.

export function formatPlayoffRound(playoffRound: number): string {
  if (playoffRound < 0) {
    return `Lower Round ${Math.abs(playoffRound)}`;
  }
  return `Upper Round ${playoffRound}`;
}

/**
 * Chronological sort key for signed playoff rounds:
 * Upper Round 1, Lower Round 1, Upper Round 2, Lower Round 2, ...
 */
export function playoffRoundSortKey(playoffRound: number): number {
  if (playoffRound > 0) return playoffRound * 2 - 1;
  if (playoffRound < 0) return Math.abs(playoffRound) * 2;
  return 0;
}

export interface MatchHistorySortFields {
  weekNo?: number | null;
  playoffRound?: number | null;
  id?: number | null;
}

/**
 * Compare match-history entries for display order within a season:
 * regular-season weeks ascending, then playoffs in bracket order.
 */
export function compareMatchHistoryOrder(
  a: MatchHistorySortFields,
  b: MatchHistorySortFields,
): number {
  const aIsPlayoff = a.playoffRound != null;
  const bIsPlayoff = b.playoffRound != null;

  if (!aIsPlayoff && bIsPlayoff) return -1;
  if (aIsPlayoff && !bIsPlayoff) return 1;

  if (aIsPlayoff && bIsPlayoff) {
    const keyDiff = playoffRoundSortKey(a.playoffRound!) - playoffRoundSortKey(b.playoffRound!);
    if (keyDiff !== 0) return keyDiff;
    return (a.id ?? 0) - (b.id ?? 0);
  }

  const weekDiff = (a.weekNo ?? Number.POSITIVE_INFINITY) - (b.weekNo ?? Number.POSITIVE_INFINITY);
  if (weekDiff !== 0) return weekDiff;
  return (a.id ?? 0) - (b.id ?? 0);
}
