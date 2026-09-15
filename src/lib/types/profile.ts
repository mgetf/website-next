import type { ProfileMatch } from './match';

export type ProfileTab = 'overview' | '1v1' | 'stats';

export type StatsWindow = 7 | 30 | 90 | 'all';

export const STATS_WINDOWS: { id: StatsWindow; label: string }[] = [
  { id: 7, label: '7d' },
  { id: 30, label: '30d' },
  { id: 90, label: '90d' },
  { id: 'all', label: 'All' },
];

export type PlayerFoe = {
  steamId: string;
  steam64: string | null;
  name: string;
  avatar: string;
  wins: number;
  losses: number;
  matches: number;
  lastAt: string | null;
};

export type RecentDuel = {
  id: number;
  at: string;
  opponentSteamId: string;
  opponentSteam64: string | null;
  opponentName: string;
  opponentAvatar: string;
  result: 'W' | 'L';
  score: string;
  className: string;
  arena: string;
  durationSec: number | null;
};

export type RecentDouble = {
  id: number;
  at: string;
  partnerSteamId: string | null;
  partnerSteam64: string | null;
  partnerName: string;
  partnerAvatar: string;
  opponents: { steamId: string; steam64: string | null; name: string; avatar: string }[];
  result: 'W' | 'L';
  score: string;
  className: string;
  arena: string;
  durationSec: number | null;
};

export type PlayerServerStats = {
  steamId: string;
  steam64: string | null;
  region: string;
  days: StatsWindow;
  timeZone: string;
  rating: {
    series: { at: string; rating: number }[];
    peak: { at: string; rating: number } | null;
    low: { at: string; rating: number } | null;
    samples: number;
  };
  activity: {
    byWeekdayHour: number[][];
    games: number;
    timeZone: string;
    peakWeekday: number | null;
    peakHour: number | null;
    typicalHours: { start: number; end: number } | null;
    sessions: {
      count: number;
      medianDurationMin: number | null;
      medianGames: number | null;
    };
    lastSeen: string | null;
  };
  arenas: { name: string; wins: number; losses: number; matches: number }[];
  classes: { classId: string; name: string; wins: number; losses: number; matches: number }[];
  foes: PlayerFoe[];
  rivals: {
    nemesis: PlayerFoe | null;
    dominated: PlayerFoe | null;
    frequent: PlayerFoe | null;
  };
  recentDuels: RecentDuel[];
  recentDoubles: RecentDouble[];
};

export type Profile1v1Entry = {
  id: number;
  active: boolean;
  status: string;
  division: string;
  divisionId: number | null;
  region: string;
  regionId: number | null;
  seasonNum: number;
  wins: number;
  losses: number;
  isPaid: boolean;
  signupCost: number;
  matches: ProfileMatch[];
};

export type ProfileTeam = {
  teamId: number;
  teamName: string;
  avatar: string | null;
  formatCode: string;
  formatName: string;
  formatThemeKey: string;
  division: string;
  regionName: string;
  seasonNum: number;
  status: string;
  wins: number;
  losses: number;
  active: boolean;
  matches: ProfileMatch[];
};
