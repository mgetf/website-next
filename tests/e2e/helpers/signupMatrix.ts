import { PrismaClient } from '../../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  FORMAT_1V1,
  FORMAT_2V2,
  FORMAT_CODE_1V1,
  FORMAT_CODE_2V2,
  FORMAT_CODE_ULTIDUO,
  FORMAT_CODE_BBALL,
  isIndividualFormatCode,
} from '../../../src/lib/constants/formats';

export const SIGNUP_TEAM_PREFIX = 'E2E-SIGNUP';
export const JOIN_PASSWORD = 'join-pass-123';

export type MatrixFormat = { id: number; name: string; code: string };
export type MatrixRegion = {
  id: number;
  name: string;
  divisionId: number;
};
export type MatrixCell = {
  format: MatrixFormat;
  region: MatrixRegion;
  user: { steamId: string; username: string };
};

export type SignupMatrix = {
  formats: MatrixFormat[];
  regions: MatrixRegion[];
  cells: MatrixCell[];
};

const LOCAL_REGIONS = ['NA', 'EU', 'AUS', 'SA', 'ASIA', 'AFRICA'] as const;
const LOCAL_FORMATS = [
  { id: FORMAT_1V1, name: '1v1', code: FORMAT_CODE_1V1 },
  { id: FORMAT_2V2, name: '2v2', code: FORMAT_CODE_2V2 },
  { id: 3, name: 'Ultiduo', code: FORMAT_CODE_ULTIDUO },
  { id: 4, name: 'BBall', code: FORMAT_CODE_BBALL },
] as const;

function createPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for signup matrix seeding');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function steamIdForIndex(index: number): string {
  return `765611981${String(index).padStart(8, '0')}`;
}

/** Seed 6 regions × 4 formats with a free division and open signup season each. */
export async function seedSignupMatrix(): Promise<SignupMatrix> {
  const prisma = createPrisma();
  try {
    await prisma.format.createMany({
      data: LOCAL_FORMATS.map((f) => {
        const individual = f.code === FORMAT_CODE_1V1;
        return {
          id: f.id,
          name: f.name,
          code: f.code,
          isIndividual: individual,
          minRosterSize: individual ? 1 : 2,
          maxRosterSize: individual ? 1 : 3,
          requiredPaidPlayers: individual ? 1 : 2,
          supportsJoinPassword: !individual,
          supportsAcronym: !individual,
          supportsReregistration: !individual,
        };
      }),
    });
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('formats', 'id'), (SELECT MAX(id) FROM formats))`,
    );

    const regions: MatrixRegion[] = [];
    for (const name of LOCAL_REGIONS) {
      const region = await prisma.region.create({
        data: {
          name,
          currencySymbol: name === 'EU' ? '€' : '$',
          currencyCode: name === 'EU' ? 'EUR' : 'USD',
        },
      });
      const division = await prisma.division.create({
        data: {
          name: 'Invite',
          signupCost: 0,
          regionId: region.id,
        },
      });
      regions.push({ id: region.id, name: region.name, divisionId: division.id });
    }

    const formats: MatrixFormat[] = LOCAL_FORMATS.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
    }));

    for (const format of formats) {
      for (const region of regions) {
        const season = await prisma.season.create({
          data: {
            seasonNum: 1,
            numWeeks: 1,
            regionId: region.id,
            formatId: format.id,
            signupsOpen: true,
            rosterLocked: false,
            paymentRequired: false,
          },
        });
        await prisma.activeSignupSeason.create({
          data: {
            regionId: region.id,
            formatId: format.id,
            seasonId: season.id,
          },
        });
      }
    }

    const cells: MatrixCell[] = [];
    let userIndex = 0;
    for (const format of formats) {
      for (const region of regions) {
        const steamId = steamIdForIndex(userIndex);
        const username = `${format.code}-${region.name} Player`;
        await prisma.user.upsert({
          where: { steamId },
          create: {
            steamId,
            steamUsername: username,
            steamAvatar:
              'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
            permissionLevel: 'GUEST',
            banStatus: 'NONE',
          },
          update: {
            steamUsername: username,
            permissionLevel: 'GUEST',
            banStatus: 'NONE',
          },
        });
        cells.push({
          format,
          region,
          user: { steamId, username },
        });
        userIndex += 1;
      }
    }

    return { formats, regions, cells };
  } finally {
    await prisma.$disconnect();
  }
}

/** Read currently open region×format cells from a live database (staging). */
export async function loadLiveSignupMatrix(): Promise<SignupMatrix> {
  const prisma = createPrisma();
  try {
    const rows = await prisma.activeSignupSeason.findMany({
      where: {
        season: { signupsOpen: true, rosterLocked: false },
        region: { hidden: 0 },
      },
      include: {
        format: { select: { id: true, name: true, code: true } },
        region: { select: { id: true, name: true } },
      },
      orderBy: [{ formatId: 'asc' }, { regionId: 'asc' }],
    });

    const divisions = await prisma.division.findMany({
      where: { hidden: 0 },
      select: { id: true, regionId: true, signupCost: true, name: true },
      orderBy: { signupCost: 'asc' },
    });

    const freeByRegion = new Map<number, number>();
    for (const d of divisions) {
      if (!freeByRegion.has(d.regionId)) {
        freeByRegion.set(d.regionId, d.id);
      }
    }

    const formatByCode = new Map<string, MatrixFormat>();
    const regionById = new Map<number, MatrixRegion>();
    const cells: MatrixCell[] = [];
    let userIndex = 0;

    for (const row of rows) {
      const code = row.format.code.toLowerCase();
      if (!formatByCode.has(code)) {
        formatByCode.set(code, { id: row.format.id, name: row.format.name, code });
      }
      const format = formatByCode.get(code)!;
      const divisionId = freeByRegion.get(row.region.id);
      if (!divisionId) continue;

      if (!regionById.has(row.region.id)) {
        regionById.set(row.region.id, {
          id: row.region.id,
          name: row.region.name,
          divisionId,
        });
      }
      const region = regionById.get(row.region.id)!;

      const steamId = steamIdForIndex(userIndex);
      const username = `${code}-${row.region.name} Player`;
      await prisma.user.upsert({
        where: { steamId },
        create: {
          steamId,
          steamUsername: username,
          steamAvatar:
            'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          permissionLevel: 'GUEST',
          banStatus: 'NONE',
        },
        update: {
          steamUsername: username,
          permissionLevel: 'GUEST',
          banStatus: 'NONE',
        },
      });

      cells.push({ format, region, user: { steamId, username } });
      userIndex += 1;
    }

    return {
      formats: [...formatByCode.values()],
      regions: [...regionById.values()],
      cells,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function getCreatedSignupTeam(params: {
  formatId: number;
  regionId: number;
  ownerSteamId: string;
}): Promise<{ id: number; formatId: number; regionId: number; status: string } | null> {
  const prisma = createPrisma();
  try {
    const membership = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: params.ownerSteamId,
        active: 1,
        permissionLevel: 2,
        team: {
          formatId: params.formatId,
          regionId: params.regionId,
        },
      },
      include: {
        team: { select: { id: true, formatId: true, regionId: true, status: true } },
      },
    });
    const team = membership?.team;
    if (!team || team.regionId == null) return null;
    return {
      id: team.id,
      formatId: team.formatId,
      regionId: team.regionId,
      status: team.status,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function cleanupSignupMatrixTeams(ownerSteamIds: string[]): Promise<number> {
  if (ownerSteamIds.length === 0) return 0;
  const prisma = createPrisma();
  try {
    const teams = await prisma.team.findMany({
      where: {
        OR: [
          { name: { startsWith: SIGNUP_TEAM_PREFIX } },
          {
            players: {
              some: {
                playerSteamId: { in: ownerSteamIds },
                permissionLevel: 2,
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (teams.length === 0) return 0;
    const ids = teams.map((t) => t.id);
    await prisma.playerInTeam.deleteMany({ where: { teamId: { in: ids } } });
    await prisma.pendingPlayer.deleteMany({ where: { teamId: { in: ids } } });
    await prisma.teamHistory.deleteMany({ where: { teamId: { in: ids } } });
    await prisma.team.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
  } finally {
    await prisma.$disconnect();
  }
}

export function teamNameForCell(cell: MatrixCell): string {
  return `${SIGNUP_TEAM_PREFIX}-${cell.format.code}-${cell.region.name}`.slice(0, 25);
}

export { isIndividualFormatCode };
