/**
 * Shared league navigation types (client + server safe).
 */

import type { BracketData } from './bracket';

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
  iconUrl: string | null;
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
  kind: 'match';
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

/** A team with no opponent that week. Shown in the same list as matches. */
export interface LeagueDivisionBye {
  kind: 'bye';
  id: number;
  weekNo: number;
  weekLabel: string;
  href: string;
  team: LeagueMatchSide;
}

export type LeagueScheduleRow = LeagueDivisionMatch | LeagueDivisionBye;

export interface LeagueMatchWeekGroup {
  weekNo: number;
  weekLabel: string;
  matches: LeagueScheduleRow[];
}

export interface LeaguePlayoffPlacement {
  place: number;
  label: string;
  href: string;
}

/** One division's playoff tree on `/leagues/[format]`. */
export interface LeaguePlayoffDivision {
  divisionId: number;
  divisionName: string;
  bracket: BracketData;
  placements: LeaguePlayoffPlacement[];
}
