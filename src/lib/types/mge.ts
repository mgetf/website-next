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

export interface MgeClasseloRating extends MgeRating {
  class: number;
  className: string;
  /** 1-based class leaderboard place. Null until the row clears the ranked bar. */
  eloRank: number | null;
}

export interface PlatformRegion {
  code: string;
  flag: string | null;
}
