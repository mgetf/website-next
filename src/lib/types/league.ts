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
