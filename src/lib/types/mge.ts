export interface MgeRating {
  region: string;
  elo: number;
  rd: number | null;
  volatility: number | null;
  displayRating: number;
  provisional: boolean;
  wins: number | null;
  losses: number | null;
  lastPlayed: string | null;
  updatedAt: string;
}

export interface PlatformRegion {
  code: string;
  flag: string | null;
}
