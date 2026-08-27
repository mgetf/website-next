export const PROVISIONAL_RATING_TITLE = 'Rating still adjusting (new or returning player)';

export function ratingValue(elo: number): number {
  return Math.round(elo);
}
