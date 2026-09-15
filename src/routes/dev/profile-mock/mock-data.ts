import type { MgeRating, PlatformRegion } from '$lib/types/mge';
import type { PlayerFoe, PlayerServerStats, StatsWindow } from '$lib/types/profile';
import { UserRole } from '$lib/types/user';

export type ViewerRole = 'visitor' | 'owner' | 'staff';
export type EntryScenario = 'none' | 'unready_unpaid' | 'pending' | 'active';
export type ProfileTab = 'overview' | '1v1' | 'stats' | 'league' | 'chat';
export type RatingCount = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Face photos (Steam-like). Seeded so reloads stay stable. */
export function mockFace(seed: string, size = 184): string {
  return `https://i.pravatar.cc/${size}?u=${encodeURIComponent(seed)}`;
}

/** Photos as stand-in team logos. Seeded so each team keeps the same image. */
export function mockPhoto(seed: string, size = 96): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;
}

export type MockMatch = {
  matchId: number;
  week: string;
  opponentName: string;
  opponentId: number | null;
  result: 'W' | 'L' | 'D' | 'TBD';
  score: string;
};

export type Mock1v1Entry = {
  id: number;
  active: boolean;
  status: 'UNREADY' | 'PENDING' | 'READY' | 'DEAD';
  division: string;
  divisionId: number | null;
  region: string;
  regionId: number;
  seasonNum: number;
  wins: number;
  losses: number;
  isPaid: boolean;
  signupCost: number;
  matches: MockMatch[];
};

export type TeamCount = 0 | 1 | 2 | 3;
export type TeamFormatCode = '2v2' | 'ultiduo' | 'bball';

export type MockTeam = {
  teamId: number;
  teamName: string;
  avatar: string;
  formatCode: TeamFormatCode;
  formatName: string;
  formatThemeKey: string;
  division: string;
  regionName: string;
  seasonNum: number;
  status: string;
  wins: number;
  losses: number;
  active: boolean;
  matches: MockMatch[];
};

export const MOCK_STEAM_ID = '76561198012345678';

/** Current fleet (5) plus two hypothetical future regions for layout stress. */
export const PLATFORM_REGIONS: PlatformRegion[] = [
  { code: 'sa', flag: 'ar' },
  { code: 'na', flag: 'us' },
  { code: 'eu', flag: 'eu' },
  { code: 'asia', flag: 'sg' },
  { code: 'aus', flag: 'au' },
  { code: 'me', flag: 'ae' },
  { code: 'af', flag: 'za' },
];

export const MOCK_PLAYER = {
  steamId: MOCK_STEAM_ID,
  name: 'pharaoh',
  avatar: mockFace('mge-pharaoh', 256),
  discordLinked: true,
  discordUsername: 'pharaoh',
  permissionLevel: UserRole.MODERATOR,
  banStatus: 'NONE',
  punishmentCount: 0,
  nameOverride: 0,
  avatarOverride: 0,
  staffAssignments: [
    { formatName: '1v1', divisionName: 'Invite', regionName: 'SA' },
    { formatName: '1v1', divisionName: 'Advanced', regionName: 'SA' },
    { formatName: '1v1', divisionName: 'Main', regionName: 'EU' },
    { formatName: '2v2', divisionName: 'Division 1', regionName: 'SA' },
  ],
};

/**
 * Home region first (SA). Extra rows exist so the toolbar can reveal 2–7 cards.
 * A typical player only has the first one.
 */
const RATING_CATALOG: MgeRating[] = [
  {
    region: 'sa',
    elo: 1901,
    rd: 74,
    volatility: 0.061,
    displayRating: 1901,
    provisional: false,
    wins: 412,
    losses: 247,
    lastPlayed: '2026-09-14T18:10:00.000Z',
    updatedAt: '2026-09-14T18:12:00.000Z',
  },
  {
    region: 'na',
    elo: 1842,
    rd: 118,
    volatility: 0.07,
    displayRating: 1842,
    provisional: false,
    wins: 18,
    losses: 14,
    lastPlayed: '2026-06-02T22:04:00.000Z',
    updatedAt: '2026-06-02T22:05:00.000Z',
  },
  {
    region: 'eu',
    elo: 1766,
    rd: 140,
    volatility: 0.075,
    displayRating: 1766,
    provisional: false,
    wins: 9,
    losses: 11,
    lastPlayed: '2026-04-18T16:40:00.000Z',
    updatedAt: '2026-04-18T16:41:00.000Z',
  },
  {
    region: 'asia',
    elo: 1712,
    rd: 165,
    volatility: 0.08,
    displayRating: 1712,
    provisional: true,
    wins: 6,
    losses: 5,
    lastPlayed: '2026-03-01T11:20:00.000Z',
    updatedAt: '2026-03-01T11:21:00.000Z',
  },
  {
    region: 'aus',
    elo: 1604,
    rd: 180,
    volatility: 0.09,
    displayRating: 1604,
    provisional: true,
    wins: 4,
    losses: 7,
    lastPlayed: '2026-01-12T09:18:00.000Z',
    updatedAt: '2026-01-12T09:20:00.000Z',
  },
  {
    region: 'me',
    elo: 1688,
    rd: 190,
    volatility: 0.09,
    displayRating: 1688,
    provisional: true,
    wins: 3,
    losses: 2,
    lastPlayed: '2025-11-20T20:00:00.000Z',
    updatedAt: '2025-11-20T20:01:00.000Z',
  },
  {
    region: 'af',
    elo: 1590,
    rd: 220,
    volatility: 0.1,
    displayRating: 1590,
    provisional: true,
    wins: 2,
    losses: 3,
    lastPlayed: '2025-09-08T18:00:00.000Z',
    updatedAt: '2025-09-08T18:01:00.000Z',
  },
];

export function getRatings(count: RatingCount): MgeRating[] {
  return RATING_CATALOG.slice(0, count);
}

export const MOCK_DIVISIONS_1V1 = [
  { id: 11, name: 'Invite', signupCost: 10, regionId: 1 },
  { id: 12, name: 'Advanced', signupCost: 5, regionId: 1 },
  { id: 13, name: 'Intermediate', signupCost: 0, regionId: 1 },
  { id: 14, name: 'Main', signupCost: 0, regionId: 1 },
  { id: 15, name: 'Open', signupCost: 0, regionId: 1 },
];

const S5_1V1: Mock1v1Entry = {
  id: 501,
  active: false,
  status: 'READY',
  division: 'Advanced',
  divisionId: 12,
  region: 'SA',
  regionId: 1,
  seasonNum: 5,
  wins: 12,
  losses: 6,
  isPaid: true,
  signupCost: 5,
  matches: [
    {
      matchId: 9101,
      week: 'Week 1',
      opponentName: 'b4nny',
      opponentId: null,
      result: 'L',
      score: '2–5',
    },
    {
      matchId: 9102,
      week: 'Week 2',
      opponentName: 'paddie',
      opponentId: null,
      result: 'W',
      score: '5–3',
    },
    {
      matchId: 9103,
      week: 'Week 3',
      opponentName: 'arekk',
      opponentId: null,
      result: 'W',
      score: '5–1',
    },
    {
      matchId: 9104,
      week: 'Week 4',
      opponentName: 'kritz',
      opponentId: null,
      result: 'W',
      score: '5–4',
    },
  ],
};

function current1v1(scenario: EntryScenario): Mock1v1Entry | null {
  if (scenario === 'none') return null;
  if (scenario === 'unready_unpaid') {
    return {
      id: 612,
      active: true,
      status: 'UNREADY',
      division: 'Invite',
      divisionId: 11,
      region: 'SA',
      regionId: 1,
      seasonNum: 6,
      wins: 0,
      losses: 0,
      isPaid: false,
      signupCost: 10,
      matches: [],
    };
  }
  if (scenario === 'pending') {
    return {
      id: 612,
      active: true,
      status: 'PENDING',
      division: 'Invite',
      divisionId: 11,
      region: 'SA',
      regionId: 1,
      seasonNum: 6,
      wins: 0,
      losses: 0,
      isPaid: true,
      signupCost: 10,
      matches: [],
    };
  }
  return {
    id: 612,
    active: true,
    status: 'READY',
    division: 'Invite',
    divisionId: 11,
    region: 'SA',
    regionId: 1,
    seasonNum: 6,
    wins: 8,
    losses: 3,
    isPaid: true,
    signupCost: 10,
    matches: [
      {
        matchId: 9601,
        week: 'Week 1',
        opponentName: 'TLR',
        opponentId: null,
        result: 'W',
        score: '5–2',
      },
      {
        matchId: 9602,
        week: 'Week 2',
        opponentName: 'yomps',
        opponentId: null,
        result: 'W',
        score: '5–4',
      },
      {
        matchId: 9603,
        week: 'Week 3',
        opponentName: 'Garbuglio',
        opponentId: null,
        result: 'L',
        score: '3–5',
      },
      {
        matchId: 9604,
        week: 'Week 4',
        opponentName: 'TBD',
        opponentId: null,
        result: 'TBD',
        score: '—',
      },
    ],
  };
}

export function getEntries1v1(scenario: EntryScenario): Mock1v1Entry[] {
  const current = current1v1(scenario);
  return current ? [current, S5_1V1] : [S5_1V1];
}

export function getActive1v1(scenario: EntryScenario): Mock1v1Entry | null {
  return current1v1(scenario);
}

/** One active roster per team format. Toolbar reveals 0–3 concurrent teams. */
const ACTIVE_TEAM_CATALOG: MockTeam[] = [
  {
    teamId: 2201,
    teamName: 'coffee and rockets',
    avatar: mockPhoto('mge-team-2201'),
    formatCode: '2v2',
    formatName: '2v2',
    formatThemeKey: 'blue',
    division: 'Division 1',
    regionName: 'SA',
    seasonNum: 6,
    status: 'READY',
    wins: 5,
    losses: 2,
    active: true,
    matches: [
      {
        matchId: 7701,
        week: 'Week 1',
        opponentName: 'airshot therapy',
        opponentId: 2188,
        result: 'W',
        score: '2–0',
      },
      {
        matchId: 7702,
        week: 'Week 2',
        opponentName: 'medigun diplomats',
        opponentId: 2194,
        result: 'W',
        score: '2–1',
      },
      {
        matchId: 7703,
        week: 'Week 3',
        opponentName: 'TBD',
        opponentId: null,
        result: 'TBD',
        score: '—',
      },
    ],
  },
  {
    teamId: 2194,
    teamName: 'medigun diplomats',
    avatar: mockPhoto('mge-team-2194'),
    formatCode: 'ultiduo',
    formatName: 'Ultiduo',
    formatThemeKey: 'orange',
    division: 'Division 1',
    regionName: 'SA',
    seasonNum: 6,
    status: 'READY',
    wins: 4,
    losses: 1,
    active: true,
    matches: [
      {
        matchId: 7801,
        week: 'Week 1',
        opponentName: 'airshot therapy',
        opponentId: 1884,
        result: 'W',
        score: '2–0',
      },
      {
        matchId: 7802,
        week: 'Week 2',
        opponentName: 'pipe dreams',
        opponentId: 1760,
        result: 'W',
        score: '2–1',
      },
      {
        matchId: 7803,
        week: 'Week 3',
        opponentName: 'TBD',
        opponentId: null,
        result: 'TBD',
        score: '—',
      },
    ],
  },
  {
    teamId: 2308,
    teamName: 'glass cannon',
    avatar: mockPhoto('mge-team-2308'),
    formatCode: 'bball',
    formatName: 'BBall',
    formatThemeKey: 'primary',
    division: 'Division 2',
    regionName: 'SA',
    seasonNum: 1,
    status: 'PENDING',
    wins: 2,
    losses: 2,
    active: true,
    matches: [
      {
        matchId: 7901,
        week: 'Week 1',
        opponentName: 'hoop dreams',
        opponentId: 2310,
        result: 'W',
        score: '2–1',
      },
      {
        matchId: 7902,
        week: 'Week 2',
        opponentName: 'bounce house',
        opponentId: 2314,
        result: 'L',
        score: '0–2',
      },
    ],
  },
];

const HISTORY_TEAM_CATALOG: MockTeam[] = [
  {
    teamId: 1760,
    teamName: 'pipe dreams',
    avatar: mockPhoto('mge-team-1760'),
    formatCode: '2v2',
    formatName: '2v2',
    formatThemeKey: 'blue',
    division: 'Division 2',
    regionName: 'SA',
    seasonNum: 5,
    status: 'READY',
    wins: 3,
    losses: 5,
    active: false,
    matches: [
      {
        matchId: 7011,
        week: 'Week 1',
        opponentName: 'airshot therapy',
        opponentId: 1884,
        result: 'L',
        score: '0–2',
      },
      {
        matchId: 7012,
        week: 'Week 2',
        opponentName: 'coffee and rockets',
        opponentId: 2201,
        result: 'W',
        score: '2–1',
      },
    ],
  },
  {
    teamId: 1884,
    teamName: 'airshot therapy',
    avatar: mockPhoto('mge-team-1884'),
    formatCode: 'ultiduo',
    formatName: 'Ultiduo',
    formatThemeKey: 'orange',
    division: 'Division 2',
    regionName: 'SA',
    seasonNum: 5,
    status: 'READY',
    wins: 4,
    losses: 4,
    active: false,
    matches: [
      {
        matchId: 7111,
        week: 'Week 1',
        opponentName: 'pipe dreams',
        opponentId: 1760,
        result: 'L',
        score: '0–2',
      },
      {
        matchId: 7112,
        week: 'Week 2',
        opponentName: 'coffee and rockets',
        opponentId: 2201,
        result: 'W',
        score: '2–1',
      },
    ],
  },
];

export function getTeams(activeCount: TeamCount): MockTeam[] {
  return [...ACTIVE_TEAM_CATALOG.slice(0, activeCount), ...HISTORY_TEAM_CATALOG];
}

export type LeagueHubMatchStatus = 'NO_MATCH' | 'UNPLAYED' | 'PLAYED' | 'DISPUTE' | 'BYE';

export type LeagueHubRow = {
  id: string;
  formatName: string;
  formatThemeKey: string;
  context: string;
  division: string;
  region: string;
  seasonNum: number;
  weekNo: number;
  weekTotal: number;
  standing: string;
  record: string;
  opponent: string;
  score: string;
  matchStatus: LeagueHubMatchStatus;
  note: string;
};

const SEASON_WEEK_TOTAL = 8;

function weekNoFromLabel(week: string): number {
  const match = week.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function mockPlace(wins: number, losses: number): string {
  const played = wins + losses;
  if (played === 0) return 'Unranked';
  const pct = wins / played;
  if (pct >= 0.7) return '1st';
  if (pct >= 0.55) return '2nd';
  if (pct >= 0.4) return '4th';
  return '6th';
}

function currentMockMatch(matches: MockMatch[]): MockMatch | null {
  return matches.find((row) => row.result === 'TBD') ?? matches.at(-1) ?? null;
}

function hubStatusFromMatch(match: MockMatch | null): LeagueHubMatchStatus {
  if (!match) return 'NO_MATCH';
  if (match.result === 'TBD') return 'UNPLAYED';
  return 'PLAYED';
}

function hubNote(status: LeagueHubMatchStatus, entryStatus?: string): string {
  if (entryStatus === 'UNREADY') return 'Not ready. No match until this entry is readied.';
  if (entryStatus === 'PENDING') return 'Entry pending staff review. No week match yet.';
  if (status === 'NO_MATCH') return 'No match assigned this week.';
  if (status === 'UNPLAYED') return "This week's match is still open.";
  if (status === 'DISPUTE') return 'Score is disputed.';
  if (status === 'BYE') return 'Bye week.';
  return 'Result is in.';
}

/** Glanceable season rows from the same 1v1 / team toolbar permutations. */
export function getLeagueHub(scenario: EntryScenario, teamCount: TeamCount): LeagueHubRow[] {
  const rows: LeagueHubRow[] = [];
  const entry = getActive1v1(scenario);
  if (entry) {
    const match = currentMockMatch(entry.matches);
    const status = entry.matches.length === 0 ? 'NO_MATCH' : hubStatusFromMatch(match);
    rows.push({
      id: `1v1-${entry.id}`,
      formatName: '1v1',
      formatThemeKey: 'purple',
      context: 'Solo',
      division: entry.division,
      region: entry.region,
      seasonNum: entry.seasonNum,
      weekNo: match ? weekNoFromLabel(match.week) : 0,
      weekTotal: SEASON_WEEK_TOTAL,
      standing: mockPlace(entry.wins, entry.losses),
      record: `${entry.wins}–${entry.losses}`,
      opponent: match?.opponentName ?? '—',
      score: match?.score ?? '—',
      matchStatus: status,
      note: hubNote(status, entry.status),
    });
  }

  for (const team of getTeams(teamCount).filter((row) => row.active)) {
    const match = currentMockMatch(team.matches);
    const status = hubStatusFromMatch(match);
    rows.push({
      id: `team-${team.teamId}`,
      formatName: team.formatName,
      formatThemeKey: team.formatThemeKey,
      context: team.teamName,
      division: team.division,
      region: team.regionName,
      seasonNum: team.seasonNum,
      weekNo: match ? weekNoFromLabel(match.week) : 0,
      weekTotal: SEASON_WEEK_TOTAL,
      standing: mockPlace(team.wins, team.losses),
      record: `${team.wins}–${team.losses}`,
      opponent: match?.opponentName ?? '—',
      score: match?.score ?? '—',
      matchStatus: status,
      note: hubNote(status),
    });
  }

  return rows;
}

export function leagueMatchStatusLabel(status: LeagueHubMatchStatus): string {
  if (status === 'NO_MATCH') return 'No match';
  if (status === 'UNPLAYED') return 'Unplayed';
  if (status === 'PLAYED') return 'Played';
  if (status === 'DISPUTE') return 'Dispute';
  return 'Bye';
}

export function leagueMatchStatusColor(
  status: LeagueHubMatchStatus,
): 'green' | 'yellow' | 'red' | 'zinc' {
  if (status === 'PLAYED') return 'green';
  if (status === 'UNPLAYED' || status === 'NO_MATCH') return 'yellow';
  if (status === 'DISPUTE') return 'red';
  return 'zinc';
}

export type ChatRegion = 'sa' | 'na' | 'eu';

export type MockChatLine = {
  id: number;
  day: string;
  time: string;
  region: ChatRegion;
  server: string;
  channel: 'all' | 'team';
  text: string;
};

/** This player’s say on official mge.tf servers. Ingest is not wired. */
export const MOCK_CHAT_LOG: MockChatLine[] = [
  {
    id: 1,
    day: 'Today',
    time: '21:14:02',
    region: 'sa',
    server: 'SA · mge.tf #1',
    channel: 'all',
    text: 'gg',
  },
  {
    id: 2,
    day: 'Today',
    time: '21:12:41',
    region: 'sa',
    server: 'SA · mge.tf #1',
    channel: 'all',
    text: '!add 3',
  },
  {
    id: 3,
    day: 'Today',
    time: '20:58:17',
    region: 'sa',
    server: 'SA · mge.tf #1',
    channel: 'all',
    text: 'ns air',
  },
  {
    id: 4,
    day: 'Today',
    time: '18:22:09',
    region: 'sa',
    server: 'SA · mge.tf #2',
    channel: 'team',
    text: 'hold mid I’ll peek last',
  },
  {
    id: 5,
    day: 'Yesterday',
    time: '23:41:55',
    region: 'na',
    server: 'NA · mge.tf #1',
    channel: 'all',
    text: 'one more then I drop',
  },
  {
    id: 6,
    day: 'Yesterday',
    time: '23:18:04',
    region: 'na',
    server: 'NA · mge.tf #1',
    channel: 'all',
    text: '!remove',
  },
  {
    id: 7,
    day: 'Yesterday',
    time: '16:07:33',
    region: 'eu',
    server: 'EU · mge.tf #3',
    channel: 'all',
    text: 'ping is criminal tonight',
  },
  {
    id: 8,
    day: 'Sep 12',
    time: '22:03:11',
    region: 'sa',
    server: 'SA · mge.tf #1',
    channel: 'all',
    text: 'wp b4nny',
  },
];

export const CHAT_REGION_FILTERS: { id: 'all' | ChatRegion; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sa', label: 'SA' },
  { id: 'na', label: 'NA' },
  { id: 'eu', label: 'EU' },
];

export const MOCK_ACHIEVEMENTS: { placement: string; event: string; date: string }[] = [];

export const MOCK_TOURNAMENTS = [
  { id: 44, name: 'MGE Cup 4', date: '2026-03-12', placement: '3rd Place' },
];

export const MOCK_FIGHT_NIGHTS = [
  {
    id: 9,
    fightNightName: 'Friday Fight Night #18',
    opponent: 'arekk',
    result: 'W',
    score: '5–3',
    date: '2026-08-08',
  },
];

export type RatingPoint = { label: string; value: number };

export const MOCK_RATING_SERIES: Record<string, RatingPoint[]> = {
  na: [
    { label: 'Jun 22', value: 1712 },
    { label: 'Jul 6', value: 1738 },
    { label: 'Jul 20', value: 1751 },
    { label: 'Aug 3', value: 1744 },
    { label: 'Aug 17', value: 1789 },
    { label: 'Aug 31', value: 1810 },
    { label: 'Sep 14', value: 1842 },
  ],
  sa: [
    { label: 'May 4', value: 1764 },
    { label: 'May 18', value: 1788 },
    { label: 'Jun 1', value: 1802 },
    { label: 'Jun 15', value: 1791 },
    { label: 'Jun 29', value: 1820 },
    { label: 'Jul 13', value: 1844 },
    { label: 'Jul 27', value: 1855 },
    { label: 'Aug 3', value: 1848 },
    { label: 'Aug 10', value: 1872 },
    { label: 'Aug 17', value: 1888 },
    { label: 'Aug 24', value: 1879 },
    { label: 'Aug 31', value: 1894 },
    { label: 'Sep 7', value: 1908 },
    { label: 'Sep 14', value: 1901 },
  ],
  eu: [
    { label: 'Jun 22', value: 1698 },
    { label: 'Jul 20', value: 1722 },
    { label: 'Aug 17', value: 1758 },
    { label: 'Sep 14', value: 1766 },
  ],
  aus: [
    { label: 'Jun 22', value: 1580 },
    { label: 'Jul 20', value: 1612 },
    { label: 'Sep 14', value: 1604 },
  ],
  asia: [
    { label: 'Jun 22', value: 1680 },
    { label: 'Jul 20', value: 1695 },
    { label: 'Sep 14', value: 1712 },
  ],
  me: [
    { label: 'Jun 22', value: 1650 },
    { label: 'Jul 20', value: 1672 },
    { label: 'Sep 14', value: 1688 },
  ],
  af: [
    { label: 'Jun 22', value: 1575 },
    { label: 'Jul 20', value: 1588 },
    { label: 'Sep 14', value: 1590 },
  ],
};

/** Sunday-first, 7×24. Evening SA hours. */
export const MOCK_HEATMAP: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 5, 3, 4, 8, 11, 9, 4, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 2, 3, 7, 12, 10, 5, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 3, 5, 9, 14, 11, 6, 2],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 4, 6, 10, 16, 12, 7, 2],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 5, 8, 13, 11, 5, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4, 6, 7, 6, 5, 7, 10, 12, 8, 4, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 5, 7, 8, 6, 4, 5, 9, 10, 6, 3, 1],
];

export const MOCK_CLASS_STATS = [
  { name: 'Soldier', wins: 248, losses: 180, matches: 428 },
  { name: 'Scout', wins: 92, losses: 74, matches: 166 },
  { name: 'Demoman', wins: 51, losses: 46, matches: 97 },
];

export const MOCK_ARENAS = [
  { name: 'Spire', wins: 84, losses: 41, matches: 125 },
  { name: 'Badlands mid', wins: 61, losses: 38, matches: 99 },
  { name: 'Process mid', wins: 44, losses: 29, matches: 73 },
  { name: 'Granary last', wins: 39, losses: 33, matches: 72 },
  { name: 'Gullywash', wins: 22, losses: 21, matches: 43 },
];

/** Most-dueled opponents by volume. Same ranking the panel uses for Top foes. */
export const MOCK_FOES = [
  { name: 'arekk', wins: 18, losses: 12, matches: 30 },
  { name: 'b4nny', wins: 9, losses: 14, matches: 23 },
  { name: 'kaptain', wins: 11, losses: 8, matches: 19 },
  { name: 'paddie', wins: 8, losses: 7, matches: 15 },
  { name: 'shade', wins: 6, losses: 7, matches: 13 },
];

/** Highlighted matchups — not a volume ranking. Overlaps Top foes on purpose. */
export const MOCK_RIVALS = {
  nemesis: { name: 'b4nny', wins: 9, losses: 14, last: '3h ago' },
  dominated: { name: 'arekk', wins: 18, losses: 12, last: '2h ago' },
  frequent: { name: 'arekk', wins: 18, losses: 12, matches: 30, last: '2h ago' },
};

export const MOCK_RECENT_DUELS = [
  {
    when: '2h ago',
    opponent: 'arekk',
    result: 'W' as const,
    score: '20–17',
    className: 'soldier',
    arena: 'Spire',
    duration: '2:14',
  },
  {
    when: '3h ago',
    opponent: 'b4nny',
    result: 'L' as const,
    score: '16–20',
    className: 'soldier',
    arena: 'Badlands mid',
    duration: '3:02',
  },
  {
    when: '5h ago',
    opponent: 'kaptain',
    result: 'W' as const,
    score: '20–12',
    className: 'scout',
    arena: 'Spire',
    duration: '1:48',
  },
  {
    when: 'Yesterday',
    opponent: 'paddie',
    result: 'W' as const,
    score: '20–18',
    className: 'soldier',
    arena: 'Process mid',
    duration: '2:36',
  },
  {
    when: 'Yesterday',
    opponent: 'shade',
    result: 'L' as const,
    score: '14–20',
    className: 'demoman',
    arena: 'Granary last',
    duration: '2:21',
  },
  {
    when: '2d ago',
    opponent: 'arekk',
    result: 'W' as const,
    score: '20–19',
    className: 'soldier',
    arena: 'Spire',
    duration: '3:11',
  },
];

export const MOCK_RECENT_DOUBLES = [
  {
    when: 'Yesterday',
    partner: 'kaptain',
    opponents: ['robor', 'chad'],
    result: 'W' as const,
    score: '20–7',
    className: 'soldier',
    arena: 'Process mid',
    duration: '3:02',
  },
  {
    when: 'Yesterday',
    partner: 'kaptain',
    opponents: ['robor', 'paddie'],
    result: 'W' as const,
    score: '20–10',
    className: 'soldier',
    arena: 'Process mid',
    duration: '2:44',
  },
  {
    when: '3d ago',
    partner: 'arekk',
    opponents: ['b4nny', 'shade'],
    result: 'L' as const,
    score: '16–20',
    className: 'scout',
    arena: 'Badlands mid',
    duration: '3:18',
  },
];

export const MOCK_ACTIVITY = {
  lastSeen: '2 hours ago',
  timeZone: 'America/Argentina/Buenos_Aires',
  peakWeekday: 3,
  peakHour: 20,
  typicalHours: { start: 20, end: 0 },
  sessions: { medianDurationMin: 48, medianGames: 11 },
};

function windowFactor(window: StatsWindow): number {
  if (window === 7) return 0.12;
  if (window === 30) return 0.35;
  if (window === 90) return 0.7;
  return 1;
}

export function sliceRatingSeries(points: RatingPoint[], window: StatsWindow): RatingPoint[] {
  if (points.length === 0) return [];
  const keep = window === 7 ? 3 : window === 30 ? 6 : window === 90 ? 10 : points.length;
  return points.slice(-Math.min(keep, points.length));
}

export function scaleHeatmap(window: StatsWindow): number[][] {
  const factor = windowFactor(window);
  return MOCK_HEATMAP.map((row) => row.map((count) => Math.round(count * factor)));
}

export function scaleWlRows<T extends { wins: number; losses: number; matches: number }>(
  rows: T[],
  window: StatsWindow,
): T[] {
  const factor = windowFactor(window);
  return rows.map((row) => {
    const matches = Math.max(1, Math.round(row.matches * factor));
    const wins = Math.round(row.wins * factor);
    return { ...row, matches, wins, losses: Math.max(0, matches - wins) };
  });
}

export function heatmapGames(grid: number[][]): number {
  return grid.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);
}

export function scaleRivals(window: StatsWindow) {
  const factor = windowFactor(window);
  const n = (value: number) => Math.max(1, Math.round(value * factor));
  return {
    nemesis: {
      name: MOCK_RIVALS.nemesis.name,
      wins: n(MOCK_RIVALS.nemesis.wins),
      losses: n(MOCK_RIVALS.nemesis.losses),
      last: MOCK_RIVALS.nemesis.last,
    },
    dominated: {
      name: MOCK_RIVALS.dominated.name,
      wins: n(MOCK_RIVALS.dominated.wins),
      losses: n(MOCK_RIVALS.dominated.losses),
      last: MOCK_RIVALS.dominated.last,
    },
    frequent: {
      name: MOCK_RIVALS.frequent.name,
      wins: n(MOCK_RIVALS.frequent.wins),
      losses: n(MOCK_RIVALS.frequent.losses),
      matches: n(MOCK_RIVALS.frequent.matches),
      last: MOCK_RIVALS.frequent.last,
    },
  };
}

function clockToSec(clock: string): number {
  const [minutes, seconds] = clock.split(':').map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
}

function relativeToIso(when: string): string {
  if (when === 'Yesterday') return new Date(Date.now() - 86_400_000).toISOString();
  const hours = when.match(/^(\d+)h/);
  if (hours) return new Date(Date.now() - Number(hours[1]) * 3_600_000).toISOString();
  const days = when.match(/^(\d+)d/);
  if (days) return new Date(Date.now() - Number(days[1]) * 86_400_000).toISOString();
  return new Date().toISOString();
}

function mockFoe(
  name: string,
  wins: number,
  losses: number,
  matches: number,
  lastAt: string,
): PlayerFoe {
  return {
    steamId: name,
    steam64: null,
    name,
    avatar: mockFace(name),
    wins,
    losses,
    matches,
    lastAt,
  };
}

export function getMockServerStats(args: { region: string; days: StatsWindow }): PlayerServerStats {
  const seriesPoints = sliceRatingSeries(MOCK_RATING_SERIES[args.region] ?? [], args.days);
  const series = seriesPoints.map((point, index) => ({
    at: new Date(Date.UTC(2026, 4, 4 + index * 14)).toISOString(),
    rating: point.value,
  }));
  const peak = series.reduce<(typeof series)[0] | null>(
    (best, point) => (!best || point.rating > best.rating ? point : best),
    null,
  );
  const low = series.reduce<(typeof series)[0] | null>(
    (best, point) => (!best || point.rating < best.rating ? point : best),
    null,
  );
  const heatmap = scaleHeatmap(args.days);
  const arenas = scaleWlRows(MOCK_ARENAS, args.days);
  const classes = scaleWlRows(MOCK_CLASS_STATS, args.days);
  const foesRaw = scaleWlRows(MOCK_FOES, args.days);
  const rivalsRaw = scaleRivals(args.days);
  const foes = foesRaw.map((foe) =>
    mockFoe(foe.name, foe.wins, foe.losses, foe.matches, relativeToIso('2h ago')),
  );
  const nemesis = mockFoe(
    rivalsRaw.nemesis.name,
    rivalsRaw.nemesis.wins,
    rivalsRaw.nemesis.losses,
    rivalsRaw.nemesis.wins + rivalsRaw.nemesis.losses,
    relativeToIso('3h ago'),
  );
  const dominated = mockFoe(
    rivalsRaw.dominated.name,
    rivalsRaw.dominated.wins,
    rivalsRaw.dominated.losses,
    rivalsRaw.dominated.wins + rivalsRaw.dominated.losses,
    relativeToIso('2h ago'),
  );
  const frequent = mockFoe(
    rivalsRaw.frequent.name,
    rivalsRaw.frequent.wins,
    rivalsRaw.frequent.losses,
    rivalsRaw.frequent.matches,
    relativeToIso('2h ago'),
  );

  return {
    steamId: MOCK_STEAM_ID,
    steam64: MOCK_STEAM_ID,
    region: args.region,
    days: args.days,
    timeZone: MOCK_ACTIVITY.timeZone,
    rating: {
      series,
      peak,
      low,
      samples: series.length,
    },
    activity: {
      byWeekdayHour: heatmap,
      games: heatmapGames(heatmap),
      timeZone: MOCK_ACTIVITY.timeZone,
      peakWeekday: MOCK_ACTIVITY.peakWeekday,
      peakHour: MOCK_ACTIVITY.peakHour,
      typicalHours: MOCK_ACTIVITY.typicalHours,
      sessions: {
        count: 12,
        medianDurationMin: MOCK_ACTIVITY.sessions.medianDurationMin,
        medianGames: MOCK_ACTIVITY.sessions.medianGames,
      },
      lastSeen: relativeToIso('2h ago'),
    },
    arenas,
    classes: classes.map((row) => ({
      classId: row.name.toLowerCase(),
      name: row.name,
      wins: row.wins,
      losses: row.losses,
      matches: row.matches,
    })),
    foes,
    rivals: { nemesis, dominated, frequent },
    recentDuels: MOCK_RECENT_DUELS.map((row, index) => ({
      id: index + 1,
      at: relativeToIso(row.when),
      opponentSteamId: row.opponent,
      opponentSteam64: null,
      opponentName: row.opponent,
      opponentAvatar: mockFace(row.opponent),
      result: row.result,
      score: row.score,
      className: row.className,
      arena: row.arena,
      durationSec: clockToSec(row.duration),
    })),
    recentDoubles: MOCK_RECENT_DOUBLES.map((row, index) => ({
      id: index + 1,
      at: relativeToIso(row.when),
      partnerSteamId: row.partner,
      partnerSteam64: null,
      partnerName: row.partner,
      partnerAvatar: mockFace(row.partner),
      opponents: row.opponents.map((name) => ({
        steamId: name,
        steam64: null,
        name,
        avatar: mockFace(name),
      })),
      result: row.result,
      score: row.score,
      className: row.className,
      arena: row.arena,
      durationSec: clockToSec(row.duration),
    })),
  };
}

export const EXTERNAL_LINKS = [
  {
    name: 'Steam',
    url: `https://steamcommunity.com/profiles/${MOCK_STEAM_ID}`,
    logo: '/steam_logo.png',
  },
  { name: 'logs.tf', url: `https://logs.tf/profile/${MOCK_STEAM_ID}`, logo: '/logstf_logo.png' },
  {
    name: 'RGL',
    url: `https://rgl.gg/Public/PlayerProfile.aspx?p=${MOCK_STEAM_ID}`,
    logo: '/rgl_logo.png',
  },
  { name: 'ETF2L', url: `https://etf2l.org/search/${MOCK_STEAM_ID}/`, logo: '/etf2l_logo.png' },
  {
    name: 'UGC-Gaming',
    url: 'https://stats.ugc-gaming.net/mge-stats/?search=STEAM_0:0:26039975',
    logo: '/ugcgaming_logo.png',
  },
  {
    name: 'SteamHistory',
    url: `https://steamhistory.net/id/${MOCK_STEAM_ID}`,
    logo: '/steamhistory_logo.jpg',
    rounded: true,
  },
  {
    name: 'SteamLadder',
    url: `https://steamladder.com/profile/${MOCK_STEAM_ID}/`,
    logo: '/steamladder_logo.png',
  },
];
