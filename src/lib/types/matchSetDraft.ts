export type MatchSetDraftStatus = 'DRAFT' | 'PUBLISHED' | 'DISCARDED';

export type MatchSetDraftKind = 'SET' | 'SINGLE';

export interface MatchSetDraftPairingInput {
  homeTeamId: number;
  awayTeamId: number;
}

export interface MatchSetDraftTeam {
  id: number;
  name: string;
  acronym: string | null;
  wins: number;
  losses: number;
  seed: number;
}

export interface MatchSetDraftListItem {
  id: number;
  kind: MatchSetDraftKind;
  isPlayoff: boolean;
  weekNo: number | null;
  playoffRound: number | null;
  matchCount: number;
  regionName: string;
  divisionName: string;
  formatName: string;
  seasonNo: number;
  createdByName: string;
  createdAt: string;
}

export interface SingleMatchBoardTeam {
  id: number;
  name: string;
  acronym: string | null;
  wins: number;
  losses: number;
  scheduledThisRound: boolean;
  onBye: boolean;
}

export interface SingleMatchMeeting {
  teamAId: number;
  teamBId: number;
  count: number;
}

export interface SingleMatchBoard {
  divisionId: number;
  seasonId: number;
  weekNo: number | null;
  playoffRound: number | null;
  teams: SingleMatchBoardTeam[];
  meetings: SingleMatchMeeting[];
}

export interface MatchSetDraftDetail {
  id: number;
  kind: MatchSetDraftKind;
  status: MatchSetDraftStatus;
  regionId: number;
  regionName: string;
  divisionId: number;
  divisionName: string;
  formatId: number;
  formatName: string;
  seasonId: number;
  seasonNo: number;
  weekNo: number | null;
  boSeries: number;
  boGames: number | null;
  arenaId: number | null;
  arenaName: string | null;
  matchDateTime: string;
  matchTimezone: string;
  mapBanPoolId: number | null;
  mapBanPoolName: string | null;
  isPlayoff: boolean;
  playoffId: number | null;
  playoffRound: number | null;
  pairings: { home: MatchSetDraftTeam; away: MatchSetDraftTeam }[];
  byeTeams: MatchSetDraftTeam[];
  byesToClear: MatchSetDraftTeam[];
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
