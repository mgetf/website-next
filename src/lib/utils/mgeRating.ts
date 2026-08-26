/**
 * Platform leaderboards rank by conservative displayRating (typically
 * rating - 2*RD), not the raw Glicko mean stored as `elo`.
 */
export function displayedElo(entry: { elo: number; displayRating?: number | null }): number {
  return typeof entry.displayRating === 'number' && Number.isFinite(entry.displayRating)
    ? entry.displayRating
    : entry.elo;
}

export function sortByDisplayedElo<T extends { elo: number }>(
  entries: T[],
  direction: 'asc' | 'desc' = 'desc',
): T[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => dir * (a.elo - b.elo));
}
