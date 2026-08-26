export interface MgeRating {
  region: string;
  elo: number;
  displayRating?: number | null;
  wins: number | null;
  losses: number | null;
  lastPlayed: string | null;
  updatedAt: string;
}
