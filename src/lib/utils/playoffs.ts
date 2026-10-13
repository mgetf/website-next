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

export type PlayoffSlotSection = 'MAIN' | 'WINNERS' | 'LOSERS' | 'GRAND_FINAL';

/**
 * Label for a stored playoff slot, using the same names as the bracket columns.
 * `roundsInSection` is how many rounds that section has, so the last one can be a final.
 */
export function formatPlayoffSlotLabel(
  section: PlayoffSlotSection,
  round: number,
  roundsInSection: number,
): string {
  if (section === 'GRAND_FINAL') {
    return round > 1 ? 'Grand Final Reset' : 'Grand Final';
  }

  const total = Math.max(roundsInSection, round, 1);
  const fromEnd = total - round + 1;
  if (section === 'WINNERS') {
    if (fromEnd === 1) return 'Winners Final';
    if (fromEnd === 2) return 'Winners Semifinal';
    return `Winners Round ${round}`;
  }
  if (section === 'LOSERS') {
    if (fromEnd === 1) return 'Losers Final';
    if (fromEnd === 2) return 'Losers Semifinal';
    return `Losers Round ${round}`;
  }
  if (fromEnd === 1) return 'Final';
  if (fromEnd === 2) return 'Semifinals';
  if (fromEnd === 3) return 'Quarterfinals';
  return `Round ${round}`;
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
