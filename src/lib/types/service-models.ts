/**
 * Soft-stub / service DTO shapes used after Prisma ripout.
 * Keep these aligned with former Prisma select/include projections that routes expect.
 */

import type { BanStatus, MatchStatus, TeamStatus, UserRole } from './enums';

export interface RegionRef {
  id: number;
  name: string;
  hidden?: number;
  currencySymbol?: string;
  currencyCode?: string;
}

export interface DivisionRef {
  id: number;
  name: string;
  regionId?: number;
  signupCost?: number;
  sortOrder?: number;
  hidden?: number;
}

export interface SeasonRef {
  id: number;
  seasonNum: number;
  numWeeks?: number;
  regionId?: number;
  formatId?: number;
  signupsOpen?: boolean;
  rosterLocked?: boolean;
  paymentRequired?: boolean;
  matchWeek?: number;
  matchDeadline?: Date | string | null;
  info?: string | null;
  region?: RegionRef | null;
}

export interface FormatRef {
  id: number;
  name: string;
  code?: string;
}

export interface UserRef {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
  permissionLevel?: UserRole | string;
  banStatus?: BanStatus | string;
}

export interface DiscordLink {
  discordId?: string;
  discordUsername: string | null;
}

export interface StaffDivisionRef {
  id: number;
  name: string;
  region?: { id?: number; name: string } | null;
}

export interface UserRecord {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
  permissionLevel: UserRole | string;
  banStatus: BanStatus | string;
  nameOverride?: number;
  avatarOverride?: number;
  sessionVersion?: number;
  discord: DiscordLink | null;
  staffDivisions: StaffDivisionRef[];
}

export interface PublicUserRow {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
  permissionLevel: UserRole | string;
  banStatus: BanStatus | string;
  discord: { discordUsername: string | null } | null;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  perPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TeamListRow {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  wins: number;
  losses: number;
  status: TeamStatus | string;
  paymentStatus: number;
  formatId: number;
  division: { id: number; name: string } | null;
  region: { id: number; name: string } | null;
  season: { id: number; seasonNum: number } | null;
  _count: { homeMatches: number; awayMatches: number };
}

export interface PublicTeamRow {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  wins: number;
  losses: number;
  status: TeamStatus | string;
  division: { id: number; name: string } | null;
  region: { id: number; name: string } | null;
  season: { id: number; seasonNum: number } | null;
  _count: { players: number };
}

export interface StandingsTeamRow {
  id: number;
  name: string;
  acronym: string | null;
  avatar: string | null;
  wins: number;
  losses: number;
  pointsScored: number;
  pointsScoredAgainst: number;
  gamesWon: number;
  gamesLost: number;
  paymentStatus: number;
  division: { id: number; name: string } | null;
  region: { id: number; name: string } | null;
}

export interface Homepage1v1Entry {
  rank: number;
  id: number;
  name: string;
  avatar: string | null;
  steamId: string | null;
  wins: number;
  losses: number;
  record: string;
  pointsPerGame: number;
}

export interface SeasonFilterRow {
  id: number;
  seasonNum: number;
  regionId: number;
  formatId: number;
  region: { id: number; name: string };
  format: { id: number; name: string };
}

export interface LatestSeasonPerRegion extends SeasonRef {
  regionId: number;
  signupsOpen: boolean;
  region: RegionRef;
}

export interface DivisionRecord {
  id: number;
  name: string;
  signupCost: number;
  hidden: number;
  regionId: number;
  sortOrder?: number;
}

export interface RegionRecord {
  id: number;
  name: string;
  hidden: number;
  currencySymbol: string;
  currencyCode: string;
}

export interface SteamItemRecord {
  id: number;
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl: string | null;
}

export interface ItemPaymentOrderRow {
  id: number;
  orderNumber: string;
  playerSteamId: string;
  player: { steamUsername: string; steamAvatar: string | null };
  team: { id: number; name: string };
  itemName: string;
  itemsRequired: number;
  itemsReceived: number;
  status: string;
  tradeOfferId: string | null;
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}

export interface ItemPaymentOrderStatus {
  playerSteamId: string;
  status: string;
  orderNumber: string;
  completedAt: Date | null;
}

export interface AdminTeamMatchRow {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  weekNo: number | null;
  status: MatchStatus | string;
  winnerScore: number | null;
  loserScore: number | null;
  matchDateTime: Date | null;
  homeTeam: { name: string };
  awayTeam: { name: string };
}

export interface AdminMatchListRow {
  id: number;
  weekNo: number | null;
  playoffRound: number | null;
  status: MatchStatus | string;
  winnerScore: number | null;
  loserScore: number | null;
  matchDateTime: Date | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: {
    id: number;
    name: string;
    acronym: string | null;
    division: { id: number; name: string } | null;
    region: { id: number; name: string } | null;
  };
  awayTeam: {
    id: number;
    name: string;
    acronym: string | null;
    division: { id: number; name: string } | null;
    region: { id: number; name: string } | null;
  };
  season: {
    id: number;
    seasonNum: number;
    region: { name: string };
  };
  games?: Array<{
    id: number;
    gameNum: number;
    homeTeamScore: number | null;
    awayTeamScore: number | null;
    arena: { id: number; name: string } | null;
  }>;
  playoff?: { id: number } | null;
}

export interface AuditLogRow {
  id: string;
  timestamp: Date;
  actorId: string | null;
  actorRole: string | null;
  category: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  actor?: UserRef | null;
  targetUser?: { steamUsername: string | null; steamAvatar: string | null } | null;
}

export interface AuditLogStatsRow {
  category: string;
  count: number;
}

export interface AuditLogsResult {
  logs: AuditLogRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ActiveSignupSeasonRow {
  id: number;
  formatId: number;
  regionId: number;
  seasonId: number;
  season?: SeasonRef | null;
  region?: RegionRef | null;
  format?: FormatRef | null;
}

export interface ActiveSignupSeasonWithDeadline {
  id: number;
  formatId: number;
  regionId: number;
  seasonId: number;
  season: {
    id: number;
    seasonNum: number;
    matchWeek: number | null;
    matchDeadline: Date | null;
    signupsOpen?: boolean;
  };
  region?: RegionRef | null;
  format?: FormatRef | null;
}

export interface SiteContentRow {
  key: string;
  content: string;
  updatedAt?: Date | null;
  updatedBy?: string | null;
}

export interface DiscordUserLookup {
  discordId: string;
  discordUsername: string | null;
  player: UserRecord | null;
}

export interface PlayerTeamMembership {
  playerSteamId: string;
  teamId: number;
  active: number;
  permissionLevel: number;
  paymentStatus: number;
  startedAt: Date;
  leftAt: Date | null;
  team: {
    id: number;
    name: string;
    status: TeamStatus | string;
    wins: number;
    losses: number;
    regionId: number | null;
    division: DivisionRef | null;
    region: RegionRef | null;
    season: SeasonRef | null;
  };
}

export interface TournamentPlacementRow {
  steamId: string;
  placement: number;
  event: { id: number; name: string; startedAt: Date | null };
}

export interface FightNightMatchupRow {
  steamId: string;
  side: number;
  match: {
    id: number;
    winnerSide: number | null;
    side1Score: number | null;
    side2Score: number | null;
    players: Array<{
      side: number;
      displayName: string | null;
      user: UserRef | null;
    }>;
    stage: {
      event: { id: number; name: string; startedAt: Date | null; type?: string };
    };
  };
}

export interface PlayerProfile {
  player: {
    steamId: string;
    name: string;
    avatar: string | null;
    discordLinked: boolean;
    discordUsername: string | null;
    permissionLevel: UserRole | string;
    banStatus: BanStatus | string;
    punishmentCount: number;
    nameOverride: number;
    avatarOverride: number;
    staffDivisions: Array<{ name: string; region: string }>;
  };
  currentTeams: Array<{
    teamId: number;
    teamName: string;
    division: string;
    regionName: string;
    seasonNum: number;
    status: string;
    wins: number;
    losses: number;
    totalRecord: string;
    joined: Date;
    permissionLevel: number;
    matches?: unknown[];
  }>;
  teamHistory: Array<{
    teamId: number;
    teamName: string;
    division: string;
    regionName: string;
    seasonNum: number;
    status: string;
    wins: number;
    losses: number;
    totalRecord: string;
    joined: Date;
    left: Date | null;
    matches?: unknown[];
  }>;
  tournaments: Array<{
    id: number;
    name: string;
    date: Date | null;
    placement: string;
  }>;
  fightNights: Array<{
    id: number;
    fightNightName: string;
    opponent: string;
    result: string;
    score: string;
    date: Date | null;
  }>;
  achievements: Array<{
    placement: string;
    event: string;
    date: Date | null;
  }>;
  current1v1Entry: {
    id: number;
    division: string;
    divisionId: number | null;
    region: string;
    regionId: number | null;
    seasonNum: number;
    wins: number;
    losses: number;
  } | null;
  entries1v1: Array<{
    id: number;
    active: boolean;
    status: string;
    division: string;
    divisionId: number | null;
    regionId: number | null;
    region: string;
    seasonNum: number;
    wins: number;
    losses: number;
    startedAt: Date;
    leftAt: Date | null;
    isPaid: boolean;
    signupCost: number;
    matches?: unknown[];
  }>;
}

export interface TeamAuditSnapshot {
  id: number;
  name: string;
  acronym: string | null;
  status: TeamStatus | string;
  seasonId: number | null;
  divisionId: number | null;
  regionId: number | null;
  paymentStatus: number;
  formatId: number;
  avatar: string | null;
  divisionName: string | null;
  regionName: string | null;
  seasonNum: number | null;
}

export interface ByeWeekRow {
  seasonId: number;
  weekNo: number;
  season: { seasonNum: number };
}

export interface TeamMatchHistoryRow {
  id: number;
  weekNo: number | null;
  playoffRound: number | null;
  status: MatchStatus | string;
  seasonId: number;
  homeTeamId: number;
  awayTeamId: number;
  winnerId: number | null;
  winnerScore: number | null;
  loserScore: number | null;
  matchDateTime: Date | null;
  homeTeam: { id: number; name: string; acronym?: string | null };
  awayTeam: { id: number; name: string; acronym?: string | null };
  season: { id: number; seasonNum: number };
}
