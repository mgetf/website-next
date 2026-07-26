/**
 * E2E season seed helpers.
 * Uses Prisma against the test database — keeps admin SPA setup out of the
 * fragile browser path while still exercising player-facing UI flows.
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
} as const;

export type SeasonSeed = {
  regionId: number;
  divisionId: number;
  seasonId: number;
  seasonNum: number;
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

/** Seed formats, region, free division, open 2v2 season, arenas, map pool, playoff config. */
export async function seedLeagueInfrastructure(): Promise<SeasonSeed> {
  const prisma = createPrisma();
  try {
    await prisma.format.createMany({
      data: [
        { id: FORMAT_1V1, name: '1v1', code: '1v1' },
        { id: FORMAT_2V2, name: '2v2', code: '2v2' },
      ],
    });
    // Keep sequences in sync after explicit IDs
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

    await prisma.activeSignupSeason.create({
      data: {
        regionId: region.id,
        formatId: FORMAT_2V2,
        seasonId: season.id,
      },
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
      seasonId: season.id,
      seasonNum: season.seasonNum,
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
 * Used when the test wants to focus on match play rather than join approval.
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
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const hashed = await hashPassword(params.joinPassword ?? 'join-pass-123');
    const team = await prisma.team.create({
      data: {
        name: params.name,
        acronym: params.acronym,
        regionId: params.regionId,
        divisionId: params.divisionId,
        seasonId: params.seasonId,
        formatId: FORMAT_2V2,
        status: 'READY',
        paymentStatus: 2,
        joinPassword: hashed,
        players: {
          create: [
            {
              playerSteamId: params.captainSteamId,
              permissionLevel: 2,
              paymentStatus: 2,
              active: 1,
            },
            {
              playerSteamId: params.teammateSteamId,
              permissionLevel: 0,
              paymentStatus: 2,
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

export async function createRegularMatch(params: {
  homeTeamId: number;
  awayTeamId: number;
  seasonId: number;
  seasonNum: number;
  weekNo: number;
  arenaId: number;
  boSeries?: number;
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const boSeries = params.boSeries ?? 1;
    const match = await prisma.match.create({
      data: {
        homeTeamId: params.homeTeamId,
        awayTeamId: params.awayTeamId,
        seasonId: params.seasonId,
        seasonNo: params.seasonNum,
        weekNo: params.weekNo,
        boSeries,
        status: 'UNPLAYED',
        matchTimezone: 'UTC',
        matchDateTime: new Date(),
        games: {
          create: Array.from({ length: boSeries }, (_, i) => ({
            gameNum: i + 1,
            arenaId: params.arenaId,
          })),
        },
      },
    });
    return match.id;
  } finally {
    await prisma.$disconnect();
  }
}

export async function createPlayoffFinal(params: {
  homeTeamId: number;
  awayTeamId: number;
  seasonId: number;
  seasonNum: number;
  playoffId: number;
  arenaId?: number | null;
  mapBanPoolId?: number;
  boSeries?: number;
}): Promise<number> {
  const prisma = createPrisma();
  try {
    const boSeries = params.boSeries ?? 1;
    // When map bans drive arena assignment, leave game arenas null until picks.
    const arenaId = params.mapBanPoolId ? null : (params.arenaId ?? null);
    const match = await prisma.match.create({
      data: {
        homeTeamId: params.homeTeamId,
        awayTeamId: params.awayTeamId,
        seasonId: params.seasonId,
        seasonNo: params.seasonNum,
        playoffId: params.playoffId,
        playoffRound: 1,
        weekNo: null,
        boSeries,
        status: 'UNPLAYED',
        matchTimezone: 'UTC',
        matchDateTime: new Date(),
        games: {
          create: Array.from({ length: boSeries }, (_, i) => ({
            gameNum: i + 1,
            arenaId,
          })),
        },
      },
    });

    if (params.mapBanPoolId) {
      await prisma.matchMapBan.create({
        data: {
          matchId: match.id,
          poolId: params.mapBanPoolId,
          currentTurn: 1, // Away bans first
          banPhaseComplete: false,
        },
      });
    }

    return match.id;
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
    const ban = await prisma.matchMapBan.findUnique({
      where: { matchId },
      select: { banPhaseComplete: true },
    });
    return ban?.banPhaseComplete ?? false;
  } finally {
    await prisma.$disconnect();
  }
}
