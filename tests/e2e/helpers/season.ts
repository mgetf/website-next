/**
 * E2E season seed helpers.
 * Uses Prisma against the test database — seeds league infrastructure while
 * player/admin mutations stay in the browser.
 */

import { PrismaClient } from '../../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { FORMAT_1V1, FORMAT_2V2 } from '../../../src/lib/constants/formats';
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

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for E2E seeding');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** Wipe all application tables (keeps migration history). */
export async function resetDatabase(): Promise<void> {
  const prisma = createPrisma();
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
    `;
    if (tables.length === 0) return;
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}

/** Seed formats, region, free division, open 2v2+1v1 seasons, arenas, map pool, playoff. */
export async function seedLeagueInfrastructure(): Promise<SeasonSeed> {
  const prisma = createPrisma();
  try {
    await prisma.format.createMany({
      data: [
        { id: FORMAT_1V1, name: '1v1', code: '1v1' },
        { id: FORMAT_2V2, name: '2v2', code: '2v2' },
      ],
    });
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('formats', 'id'), (SELECT MAX(id) FROM formats))`,
    );

    const region = await prisma.region.create({
      data: {
        name: 'E2E Region',
        currencySymbol: '$',
        currencyCode: 'USD',
      },
    });

    const division = await prisma.division.create({
      data: {
        name: 'Invite',
        signupCost: 0,
        regionId: region.id,
      },
    });

    const paidDivision = await prisma.division.create({
      data: {
        name: 'Paid',
        signupCost: 10,
        regionId: region.id,
      },
    });

    const season = await prisma.season.create({
      data: {
        seasonNum: 1,
        numWeeks: 1,
        regionId: region.id,
        formatId: FORMAT_2V2,
        signupsOpen: true,
        rosterLocked: false,
        paymentRequired: false,
      },
    });

    const season1v1 = await prisma.season.create({
      data: {
        seasonNum: 1,
        numWeeks: 1,
        regionId: region.id,
        formatId: FORMAT_1V1,
        signupsOpen: true,
        rosterLocked: false,
        paymentRequired: false,
      },
    });

    await prisma.activeSignupSeason.createMany({
      data: [
        { regionId: region.id, formatId: FORMAT_2V2, seasonId: season.id },
        { regionId: region.id, formatId: FORMAT_1V1, seasonId: season1v1.id },
      ],
    });

    const arenaNames = [
      'Process',
      'Product',
      'Playoff',
      'Clearing',
      'Sunshine',
      'Snakewater',
      'Gullywash',
    ];
    const arenas = [];
    for (const name of arenaNames) {
      arenas.push(
        await prisma.arena.create({
          data: { name, playoffMap: name === 'Playoff' ? 1 : 0 },
        }),
      );
    }

    const pool = await prisma.mapBanPool.create({
      data: {
        name: 'E2E Pool',
        isActive: true,
        mapsInPool: {
          create: arenas.map((arena, index) => ({
            arenaId: arena.id,
            orderNum: index + 1,
          })),
        },
      },
    });

    const playoff = await prisma.playoff.create({
      data: {
        seasonId: season.id,
        numRounds: 1,
        isTournament: false,
        doubleElim: 0,
      },
    });

    return {
      regionId: region.id,
      divisionId: division.id,
      paidDivisionId: paidDivision.id,
      seasonId: season.id,
      seasonNum: season.seasonNum,
      season1v1Id: season1v1.id,
      arenaIds: arenas.map((a) => a.id),
      mapBanPoolId: pool.id,
      playoffId: playoff.id,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function seedUsers(): Promise<void> {
  const prisma = createPrisma();
  try {
    for (const user of Object.values(E2E_USERS)) {
      await prisma.user.upsert({
        where: { steamId: user.steamId },
        create: {
          steamId: user.steamId,
          steamUsername: user.username,
          steamAvatar:
            'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          permissionLevel: user.role,
          banStatus: 'NONE',
        },
        update: {
          steamUsername: user.username,
          permissionLevel: user.role,
          banStatus: 'NONE',
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Create a READY 2v2 team with captain + teammate already on the roster.
 */
export async function seedReadyTeam(params: {
  name: string;
  acronym: string;
  captainSteamId: string;
  teammateSteamId: string;
  regionId: number;
  divisionId: number;
  seasonId: number;
  joinPassword?: string;
  /** 0 = unpaid, 1 = paid, 2 = free/exempt. Defaults to free/exempt. */
  paymentStatus?: number;
  status?: 'UNREADY' | 'PENDING' | 'READY';
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const hashed = await hashPassword(params.joinPassword ?? 'join-pass-123');
    const paymentStatus = params.paymentStatus ?? 2;
    const team = await prisma.team.create({
      data: {
        name: params.name,
        acronym: params.acronym,
        regionId: params.regionId,
        divisionId: params.divisionId,
        seasonId: params.seasonId,
        formatId: FORMAT_2V2,
        status: params.status ?? 'READY',
        paymentStatus,
        joinPassword: hashed,
        players: {
          create: [
            {
              playerSteamId: params.captainSteamId,
              permissionLevel: 2,
              paymentStatus,
              active: 1,
            },
            {
              playerSteamId: params.teammateSteamId,
              permissionLevel: 0,
              paymentStatus,
              active: 1,
            },
          ],
        },
      },
    });
    return team.id;
  } finally {
    await prisma.$disconnect();
  }
}

/** Seed a demo record without R2 upload (report/admin triage still exercise UI). */
export async function seedDemo(params: {
  matchId: number;
  playerSteamId: string;
  submittedBy: string;
  title?: string;
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const demo = await prisma.demo.create({
      data: {
        file: 'https://example.com/e2e/fake-demo.dem',
        playerSteamId: params.playerSteamId,
        submittedBy: params.submittedBy,
        matchId: params.matchId,
        title: params.title ?? 'E2E seeded demo',
        description: 'Seeded for report/admin triage coverage',
      },
    });
    return demo.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getPlayerPaymentStatus(
  teamId: number,
  steamId: string,
): Promise<number> {
  const prisma = createPrisma();
  try {
    const row = await prisma.playerInTeam.findUniqueOrThrow({
      where: {
        playerSteamId_teamId: { playerSteamId: steamId, teamId },
      },
      select: { paymentStatus: true },
    });
    return row.paymentStatus;
  } finally {
    await prisma.$disconnect();
  }
}

export async function countDemoReports(status?: string): Promise<number> {
  const prisma = createPrisma();
  try {
    return await prisma.demoReport.count({
      where: status ? { status: status as 'REVIEW' | 'ACTION' | 'CLEAR' } : undefined,
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function getMatchStatus(matchId: number): Promise<string> {
  const prisma = createPrisma();
  try {
    const match = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { status: true },
    });
    return match.status;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getLatestMatchId(opts?: {
  weekNo?: number | null;
  playoff?: boolean;
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const match = await prisma.match.findFirstOrThrow({
      where: {
        ...(opts?.weekNo !== undefined ? { weekNo: opts.weekNo } : {}),
        ...(opts?.playoff ? { playoffId: { not: null } } : {}),
      },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return match.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getTeamByName(name: string): Promise<{ id: number; status: string }> {
  const prisma = createPrisma();
  try {
    const team = await prisma.team.findFirstOrThrow({
      where: { name },
      select: { id: true, status: true },
    });
    return team;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getTeamStatus(teamId: number): Promise<string> {
  const prisma = createPrisma();
  try {
    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { status: true },
    });
    return team.status;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getMapBanComplete(matchId: number): Promise<boolean> {
  const prisma = createPrisma();
  try {
    const ban = await prisma.matchMapBan.findFirst({
      where: { matchId },
      select: { banPhaseComplete: true },
    });
    return ban?.banPhaseComplete ?? false;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getTeamWins(teamId: number): Promise<number> {
  const prisma = createPrisma();
  try {
    const team = await prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { wins: true },
    });
    return team.wins;
  } finally {
    await prisma.$disconnect();
  }
}

export async function getMatchTeams(
  matchId: number,
): Promise<{ homeTeamId: number; awayTeamId: number }> {
  const prisma = createPrisma();
  try {
    const match = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      select: { homeTeamId: true, awayTeamId: true },
    });
    return { homeTeamId: match.homeTeamId!, awayTeamId: match.awayTeamId! };
  } finally {
    await prisma.$disconnect();
  }
}

export async function getUserBanStatus(steamId: string): Promise<string> {
  const prisma = createPrisma();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { steamId },
      select: { banStatus: true },
    });
    return user.banStatus;
  } finally {
    await prisma.$disconnect();
  }
}

export async function countNotifications(steamId: string): Promise<number> {
  const prisma = createPrisma();
  try {
    return await prisma.notification.count({ where: { userSteamId: steamId } });
  } finally {
    await prisma.$disconnect();
  }
}
