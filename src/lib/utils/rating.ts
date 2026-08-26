export const PROVISIONAL_RATING_TITLE = 'Rating still adjusting (new or returning player)';

export function ratingValue(displayRating: number | null | undefined, elo: number): number {
  return Math.round(displayRating ?? elo);
}
