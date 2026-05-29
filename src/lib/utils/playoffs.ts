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
