/**
 * E2E season seed helpers — Rama REST only (no Prisma / no Postgres).
 * Seeds via depot append against the live cluster (RAMA_CONDUCTOR_URL).
 */

import { FORMAT_1V1, FORMAT_2V2 } from '../../../src/lib/constants/formats';
import {
  createCatalogClient,
  setActiveSignup,
  upsertFormat,
  upsertRegion,
} from '../../../src/lib/server/rama/catalog';
import { createDivisionsClient, upsertDivision } from '../../../src/lib/server/rama/divisions';
import {
  createMapPoolsClient,
  createPool,
  setPoolActive,
  setPoolMaps,
  upsertArena,
} from '../../../src/lib/server/rama/mapPools';
import {
  getPlayerPaymentStatus as ramaGetPlayerPaymentStatus,
  createPaymentsClient,
  markPaid,
} from '../../../src/lib/server/rama/payments';
import {
  createSeasonsClient,
  createSeason,
  setSeasonFlags,
} from '../../../src/lib/server/rama/seasons';
import {
  createTeam,
  createTeamsClient,
  getTeam,
  joinTeam,
  setMemberPayment,
  setTeamStatus,
} from '../../../src/lib/server/rama/teams';
import {
  createUsersClient,
  getUser,
  setBan,
  setPermission,
  upsertProfile,
} from '../../../src/lib/server/rama/users';
import {
  createMatchClient,
  getMapBan,
  getMatch,
  getMatchIdsForWeek,
  getMatchStatus as ramaGetMatchStatus,
  getTeamWins as ramaGetTeamWins,
} from '../../../src/lib/server/rama/match';
import {
  createDemo,
  createDemosClient,
  getReportIdsByStatus,
  nextDemoId,
} from '../../../src/lib/server/rama/demos';
import {
  createNotificationsClient,
  getUnreadCount,
} from '../../../src/lib/server/rama/notifications';
import { hashPassword } from '../../../src/lib/server/utils/password';

export const E2E_USERS = {
  admin: {
    steamId: '76561198000000001',
    username: 'E2E Admin',
    role: 'ADMIN' as const,
  },
  homeCaptain: {
    steamId: '76561198000000011',
    username: 'Home Captain',
    role: 'GUEST' as const,
  },
  homeTeammate: {
    steamId: '76561198000000012',
    username: 'Home Teammate',
    role: 'GUEST' as const,
  },
  homeInvitee: {
    steamId: '76561198000000013',
    username: 'Home Invitee',
    role: 'GUEST' as const,
  },
  awayCaptain: {
    steamId: '76561198000000021',
    username: 'Away Captain',
    role: 'GUEST' as const,
  },
  awayTeammate: {
    steamId: '76561198000000022',
    username: 'Away Teammate',
    role: 'GUEST' as const,
  },
  solo1v1: {
    steamId: '76561198000000031',
    username: 'Solo OneVOne',
    role: 'GUEST' as const,
  },
  homeDeclined: {
    steamId: '76561198000000014',
    username: 'Home Declined',
    role: 'GUEST' as const,
  },
  homeLinkJoiner: {
    steamId: '76561198000000015',
    username: 'Home Link Joiner',
    role: 'GUEST' as const,
  },
  homeInviteDecliner: {
    steamId: '76561198000000016',
    username: 'Home Invite Decliner',
    role: 'GUEST' as const,
  },
  paidCaptain: {
    steamId: '76561198000000041',
    username: 'Paid Captain',
    role: 'GUEST' as const,
  },
  paidTeammate: {
    steamId: '76561198000000042',
    username: 'Paid Teammate',
    role: 'GUEST' as const,
  },
} as const;

/** Numeric ids for URL/form compatibility (stored as string keys in Rama). */
export type SeasonSeed = {
  regionId: number;
  divisionId: number;
  paidDivisionId: number;
  seasonId: number;
  seasonNum: number;
  season1v1Id: number;
  arenaIds: number[];
  mapBanPoolId: number;
  playoffId: number;
};

function conductor() {
  const url = process.env.RAMA_CONDUCTOR_URL;
  if (!url) throw new Error('RAMA_CONDUCTOR_URL is required for E2E seeding');
  return { conductorUrl: url, supervisorBaseUrl: process.env.RAMA_SUPERVISOR_URL };
}

const AVATAR = 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg';

/**
 * Rama has no TRUNCATE — upserts are idempotent. Unique seasonNums avoid collisions.
 */
export async function resetDatabase(): Promise<void> {
  // no-op for Rama cluster
}

export async function seedUsers(): Promise<void> {
  const users = createUsersClient(conductor());
  for (const u of Object.values(E2E_USERS)) {
    await upsertProfile(users, {
      steamId: u.steamId,
      username: u.username,
      avatarUrl: AVATAR,
    });
    await setPermission(users, { steamId: u.steamId, permissionLevel: u.role });
    await setBan(users, { steamId: u.steamId, banStatus: 'NONE' });
  }
}

export async function seedLeagueInfrastructure(): Promise<SeasonSeed> {
  // Monotonic ids — avoid Date.now() % N wrap so "newest" season sorts correctly.
  const run = Date.now();
  const regionId = 1;
  const divisionId = 1;
  const paidDivisionId = 2;
  const seasonId = run;
  const season1v1Id = run + 1;
  // unique per run — $$season-index enforces (region, format, seasonNum)
  const seasonNum = run;
  const mapBanPoolId = 1;
  const playoffId = 1;
  const arenaNames = [
    'Process',
    'Product',
    'Playoff',
    'Clearing',
    'Sunshine',
    'Snakewater',
    'Gullywash',
  ];
  const arenaIds = arenaNames.map((_, i) => i + 1);

  const catalog = createCatalogClient(conductor());
  await upsertFormat(catalog, {
    formatId: String(FORMAT_2V2),
    name: '2v2',
    code: '2v2',
  });
  await upsertFormat(catalog, {
    formatId: String(FORMAT_1V1),
    name: '1v1',
    code: '1v1',
  });
  await upsertRegion(catalog, {
    regionId: String(regionId),
    name: 'E2E Region',
    hidden: false,
    currencySymbol: '$',
    currencyCode: 'USD',
  });

  const divisions = createDivisionsClient(conductor());
  await upsertDivision(divisions, {
    divisionId: String(divisionId),
    name: 'Invite',
    regionId: String(regionId),
    signupCost: 0,
    sortOrder: 1,
  });
  await upsertDivision(divisions, {
    divisionId: String(paidDivisionId),
    name: 'Paid',
    regionId: String(regionId),
    signupCost: 10,
    sortOrder: 2,
  });

  const seasons = createSeasonsClient(conductor());
  await createSeason(seasons, {
    seasonId: String(seasonId),
    seasonNum,
    numWeeks: 8,
    regionId: String(regionId),
    formatId: String(FORMAT_2V2),
  });
  await setSeasonFlags(seasons, {
    seasonId: String(seasonId),
    signupsOpen: true,
    rosterLocked: false,
    paymentRequired: false,
  });
  await createSeason(seasons, {
    seasonId: String(season1v1Id),
    seasonNum,
    numWeeks: 8,
    regionId: String(regionId),
    formatId: String(FORMAT_1V1),
  });
  await setSeasonFlags(seasons, {
    seasonId: String(season1v1Id),
    signupsOpen: true,
    rosterLocked: false,
    paymentRequired: false,
  });

  await setActiveSignup(catalog, {
    regionId: String(regionId),
    formatId: String(FORMAT_2V2),
    seasonId: String(seasonId),
  });
  await setActiveSignup(catalog, {
    regionId: String(regionId),
    formatId: String(FORMAT_1V1),
    seasonId: String(season1v1Id),
  });

  const pools = createMapPoolsClient(conductor());
  const arenaKeys: string[] = [];
  for (let i = 0; i < arenaNames.length; i++) {
    const arenaId = String(arenaIds[i]);
    arenaKeys.push(arenaId);
    await upsertArena(pools, {
      arenaId,
      name: arenaNames[i]!,
      playoffMap: arenaNames[i] === 'Playoff' ? 1 : 0,
    });
  }
  await createPool(pools, { poolId: String(mapBanPoolId), name: 'E2E Pool' });
  await setPoolActive(pools, { poolId: String(mapBanPoolId), isActive: true });
  await setPoolMaps(pools, { poolId: String(mapBanPoolId), arenaIds: arenaKeys });

  return {
    regionId,
    divisionId,
    paidDivisionId,
    seasonId,
    seasonNum,
    season1v1Id,
    arenaIds,
    mapBanPoolId,
    playoffId,
  };
}

export async function seedReadyTeam(params: {
  name: string;
  acronym: string;
  captainSteamId: string;
  teammateSteamId: string;
  regionId: number;
  divisionId: number;
  seasonId: number;
  joinPassword: string;
  paymentStatus?: number;
  status?: string;
}): Promise<number> {
  const teams = createTeamsClient(conductor());
  const teamId = Date.now() % 2_000_000_000;
  const hashed = await hashPassword(params.joinPassword);
  const ack = await createTeam(teams, {
    teamId: String(teamId),
    steamId: params.captainSteamId,
    name: params.name,
    acronym: params.acronym,
    formatId: String(FORMAT_2V2),
    seasonId: String(params.seasonId),
    divisionId: String(params.divisionId),
    regionId: String(params.regionId),
    joinPassword: hashed,
  });
  if (!ack.ok) throw new Error(`createTeam failed: ${ack.error}`);
  await joinTeam(teams, { teamId: String(teamId), steamId: params.teammateSteamId });
  await setTeamStatus(teams, {
    teamId: String(teamId),
    status: (params.status as 'READY' | 'UNREADY' | 'PENDING') ?? 'READY',
  });

  // Default / explicit 0 → leave roster UNPAID (create-team default).
  if (params.paymentStatus === 1) {
    const payments = createPaymentsClient(conductor());
    for (const steamId of [params.captainSteamId, params.teammateSteamId]) {
      const payAck = await setMemberPayment(teams, {
        teamId: String(teamId),
        steamId,
        paymentStatus: 'PAID',
      });
      if (!payAck.ok) throw new Error(`setMemberPayment failed: ${payAck.error}`);
      const markAck = await markPaid(payments, {
        steamId,
        seasonId: String(params.seasonId),
        teamId: String(teamId),
        status: 'PAID',
        amount: 0,
        source: 'e2e-seed',
      });
      if (!markAck.ok) throw new Error(`markPaid failed: ${markAck.error}`);
    }
  }

  return teamId;
}

export async function seedDemo(params: {
  matchId: number;
  playerSteamId: string;
  submittedBy: string;
  title?: string;
}): Promise<number> {
  const client = createDemosClient(conductor());
  const demoId = nextDemoId();
  const ack = await createDemo(client, {
    demoId,
    matchId: String(params.matchId),
    playerSteamId: params.playerSteamId,
    submittedBy: params.submittedBy,
    file: `https://example.test/e2e/${demoId}.dem`,
    title: params.title ?? 'E2E demo',
    description: '',
  });
  if (!ack.ok) throw new Error(`seedDemo failed: ${ack.error}`);
  return Number(demoId);
}

export async function getPlayerPaymentStatus(
  teamId: number,
  steamId: string,
  seasonId?: number,
): Promise<number> {
  let resolvedSeasonId = seasonId;
  if (resolvedSeasonId == null) {
    const team = await getTeam(createTeamsClient(conductor()), String(teamId));
    resolvedSeasonId = Number(team?.seasonId);
  }
  const payments = createPaymentsClient(conductor());
  const status = await ramaGetPlayerPaymentStatus(
    payments,
    steamId,
    String(resolvedSeasonId ?? '0'),
  );
  return status === 'PAID' || status === 'EXEMPT' ? 1 : 0;
}

export async function countDemoReports(status?: string): Promise<number> {
  const client = createDemosClient(conductor());
  if (status) {
    return (await getReportIdsByStatus(client, status)).length;
  }
  const statuses = ['REVIEW', 'ACTION', 'CLEAR'];
  let total = 0;
  for (const s of statuses) {
    total += (await getReportIdsByStatus(client, s)).length;
  }
  return total;
}

export async function getMatchStatus(matchId: number): Promise<string> {
  const client = createMatchClient(conductor());
  return (await ramaGetMatchStatus(client, String(matchId))) ?? 'UNKNOWN';
}

export async function getLatestMatchId(opts?: {
  homeTeamId?: number;
  awayTeamId?: number;
  weekNo?: number;
  playoff?: boolean;
  seasonId?: number;
}): Promise<number> {
  const weekNo = opts?.playoff ? 0 : (opts?.weekNo ?? 1);
  const seasonId = opts?.seasonId;
  if (seasonId == null) {
    throw new Error('getLatestMatchId: seasonId required under Rama cutover');
  }
  const client = createMatchClient(conductor());
  const ids = await getMatchIdsForWeek(client, String(seasonId), weekNo);
  const numeric = ids.map(Number).filter((n) => Number.isFinite(n));
  if (numeric.length === 0) {
    throw new Error(
      `getLatestMatchId: no matches for season ${seasonId} week ${weekNo}` +
        (opts?.playoff ? ' (playoff)' : ''),
    );
  }
  numeric.sort((a, b) => b - a);
  return numeric[0]!;
}

export async function getTeamByName(name: string): Promise<{ id: number; status: string }> {
  // TeamsModule has no name index yet — scan is not available over REST selectOne.
  // God path creates home team via UI; callers should prefer returned URL id.
  throw new Error(
    `getTeamByName(${name}): name index not in TeamsModule yet — parse id from URL after create`,
  );
}

export async function getTeamStatus(teamId: number): Promise<string> {
  const teams = createTeamsClient(conductor());
  const team = await getTeam(teams, String(teamId));
  return String(team?.status ?? 'UNKNOWN');
}

export async function getMapBanComplete(matchId: number): Promise<boolean> {
  const ban = await getMapBan(createMatchClient(conductor()), String(matchId));
  return Boolean(ban?.banPhaseComplete);
}

export async function getTeamWins(teamId: number): Promise<number> {
  const client = createMatchClient(conductor());
  return (await ramaGetTeamWins(client, String(teamId))) ?? 0;
}

export async function getMatchTeams(
  matchId: number,
): Promise<{ homeTeamId: number; awayTeamId: number }> {
  const client = createMatchClient(conductor());
  const match = await getMatch(client, String(matchId));
  if (!match) throw new Error(`match ${matchId} not found`);
  return {
    homeTeamId: Number(match.homeTeamId),
    awayTeamId: Number(match.awayTeamId),
  };
}

export async function getUserBanStatus(steamId: string): Promise<string> {
  const users = createUsersClient(conductor());
  const user = await getUser(users, steamId);
  return String(user?.banStatus ?? 'NONE');
}

export async function countNotifications(steamId: string): Promise<number> {
  const notifications = createNotificationsClient(conductor());
  return getUnreadCount(notifications, steamId);
}
