export interface MgeRating {
  region: string;
  elo: number;
  wins: number | null;
  losses: number | null;
  lastPlayed: string | null;
  updatedAt: string;
}
