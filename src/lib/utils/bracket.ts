/**
 * Generates a display label for a bracket round based on its position
 * relative to the final.
 *
 * @param roundIndex 0-based index of the round
 * @param totalRounds total number of rounds in the bracket
 */
export function getRoundLabel(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - 1 - roundIndex;

  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2 && totalRounds >= 4) return 'Quarterfinals';
  return `Round ${roundIndex + 1}`;
}
