export type TeamPageTab = 'overview' | 'management';

export type TeamAchievement = {
  id: number;
  name: string;
  date: string | Date | null;
  placement: string;
};

export type TeamRosterPlayer = {
  steamId: string;
  name: string;
  avatar: string | null;
  joinedAt: Date | string;
  isPaid: boolean;
  paymentStatus: number;
  isLeader: boolean;
  permissionLevel: number;
};

export type TeamPastPlayer = {
  steamId: string;
  name: string;
  avatar: string | null;
  joinedAt: Date | string;
  leftAt: Date | string | null;
};

export type TeamMatchArena = {
  id: number;
  name: string;
  avatar: string | null;
};

export type TeamMatchRow = {
  type?: 'bye';
  week: string;
  opponent: string | null;
  opponentId: number | null;
  opponentAvatar?: string | null;
  result: string;
  score: string | null;
  matchId: number | null;
  arenas: TeamMatchArena[];
};

export type TeamSeasonMatches = {
  seasonId: number;
  season: string;
  matches: TeamMatchRow[];
};

export type TeamManagePlayer = {
  steamId: string;
  name: string;
  avatar: string | null;
  permissionLevel: number;
};

export type TeamManageInvite = {
  steamId: string;
  name: string;
  avatar: string | null;
};

export type TeamManagementData = {
  inviteUrl: string;
  maxRosterSize: number;
  players: TeamManagePlayer[];
  sentInvites: TeamManageInvite[];
  awaitingAdmin: TeamManageInvite[];
};

export type TeamAdminDivision = {
  id: number;
  name: string;
  signupCost: number;
};
