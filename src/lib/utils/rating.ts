import type { MgeRating } from '$lib/types/mge';

export const PROVISIONAL_RATING_TITLE = 'Rating still adjusting (new or returning player)';

export function ratingValue(elo: number): number {
  return Math.round(elo);
}

function ratingGames(rating: Pick<MgeRating, 'wins' | 'losses'>): number {
  return (rating.wins ?? 0) + (rating.losses ?? 0);
}

/** Regions with at least one played game, highest rating first. */
export function visibleServerRatings(ratings: MgeRating[]): MgeRating[] {
  return ratings
    .filter((rating) => ratingGames(rating) >= 1)
    .slice()
    .sort((a, b) => b.elo - a.elo || a.region.localeCompare(b.region));
}
