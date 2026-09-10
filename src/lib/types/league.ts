/**
 * Shared league navigation types (client + server safe).
 */

export interface LeagueNavRegion {
  id: number;
  name: string;
  abbr: string;
  flagCode: string;
}

export interface LeagueNavCell {
  regionId: number;
  seasonId: number;
  seasonNum: number;
  href: string;
}

export interface LeagueNavFormat {
  id: number;
  code: string;
  name: string;
  href: string;
  themeKey: string;
  cells: LeagueNavCell[];
}

export interface LeagueNav {
  formats: LeagueNavFormat[];
  regions: LeagueNavRegion[];
}

export const EMPTY_LEAGUE_NAV: LeagueNav = { formats: [], regions: [] };

export type LeagueMatchStatus = 'UNPLAYED' | 'PLAYED' | 'DISPUTE';

export interface LeagueMatchSide {
  id: number;
  name: string;
  avatar: string | null;
  href: string;
}

/** Serializable match row for the public league schedule/results list. */
export interface LeagueDivisionMatch {
  id: number;
  weekNo: number;
  weekLabel: string;
  status: LeagueMatchStatus;
  href: string;
  home: LeagueMatchSide;
  away: LeagueMatchSide;
  homeScore: number | null;
  awayScore: number | null;
}

export interface LeagueMatchWeekGroup {
  weekNo: number;
  weekLabel: string;
  matches: LeagueDivisionMatch[];
}
