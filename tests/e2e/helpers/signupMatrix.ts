/**
 * Local signup-matrix seed. Talks only to the Playwright test Postgres
 * (same DATABASE_URL as season-god-path). Never pointed at staging/prod.
 */

import { PrismaClient } from '../../../prisma/generated/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { FORMAT_1V1, FORMAT_2V2 } from '../../../src/lib/constants/formats';

export const JOIN_PASSWORD = 'join-pass-123';
export const SIGNUP_TEAM_PREFIX = 'E2E-SIGNUP';

export type MatrixFormat = {
  id: number;
  name: string;
  code: string;
  isIndividual: boolean;
};
export type MatrixRegion = { id: number; name: string; divisionId: number };
export type MatrixUser = { steamId: string; username: string };

export type SignupMatrix = {
  formats: MatrixFormat[];
  /** Regions with every format open. */
  allFormatRegions: MatrixRegion[];
  /** Region that only has a 2v2 signup season. */
  twoV2OnlyRegion: MatrixRegion;
  users: MatrixUser[];
};

const TEAM_FORMATS = [
  { id: 3, name: 'Ultiduo', code: 'ultiduo' },
  { id: 4, name: 'BBall', code: 'bball' },
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
  return `765611982${String(index).padStart(8, '0')}`;
}

async function createRegionWithDivision(prisma: PrismaClient, name: string): Promise<MatrixRegion> {
  const region = await prisma.region.create({
    data: {
      name,
      currencySymbol: name === 'EU' ? '€' : '$',
      currencyCode: name === 'EU' ? 'EUR' : 'USD',
    },
  });
  const division = await prisma.division.create({
    data: { name: 'Invite', signupCost: 0, regionId: region.id },
  });
  return { id: region.id, name: region.name, divisionId: division.id };
}

async function openSignupSeason(
  prisma: PrismaClient,
  region: MatrixRegion,
  formatId: number,
): Promise<void> {
  const season = await prisma.season.create({
    data: {
      seasonNum: 1,
      numWeeks: 1,
      regionId: region.id,
      formatId,
      signupsOpen: true,
      rosterLocked: false,
      paymentRequired: false,
    },
  });
  await prisma.activeSignupSeason.create({
    data: { regionId: region.id, formatId, seasonId: season.id },
  });
}

/** Seed 1v1/2v2/ultiduo/bball, two fully-open regions, and one 2v2-only region. */
export async function seedSignupMatrix(): Promise<SignupMatrix> {
  const prisma = createPrisma();
  try {
    await prisma.format.createMany({
      data: [
        {
          id: FORMAT_1V1,
          name: '1v1',
          code: '1v1',
          isIndividual: true,
          minRosterSize: 1,
          maxRosterSize: 1,
          requiredPaidPlayers: 1,
          supportsJoinPassword: false,
          supportsAcronym: false,
          supportsReregistration: false,
        },
        {
          id: FORMAT_2V2,
          name: '2v2',
          code: '2v2',
          isIndividual: false,
          minRosterSize: 2,
          maxRosterSize: 3,
          requiredPaidPlayers: 2,
          supportsJoinPassword: true,
          supportsAcronym: true,
          supportsReregistration: true,
        },
        ...TEAM_FORMATS.map((f) => ({
          id: f.id,
          name: f.name,
          code: f.code,
          isIndividual: false,
          minRosterSize: 2,
          maxRosterSize: 3,
          requiredPaidPlayers: 2,
          supportsJoinPassword: true,
          supportsAcronym: true,
          supportsReregistration: true,
        })),
      ],
    });
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('formats', 'id'), (SELECT MAX(id) FROM formats))`,
    );

    const na = await createRegionWithDivision(prisma, 'NA');
    const aus = await createRegionWithDivision(prisma, 'AUS');
    const eu = await createRegionWithDivision(prisma, 'EU');

    const formats: MatrixFormat[] = [
      { id: FORMAT_1V1, name: '1v1', code: '1v1', isIndividual: true },
      { id: FORMAT_2V2, name: '2v2', code: '2v2', isIndividual: false },
      ...TEAM_FORMATS.map((f) => ({ ...f, isIndividual: false })),
    ];

    for (const format of formats) {
      await openSignupSeason(prisma, na, format.id);
      await openSignupSeason(prisma, aus, format.id);
    }
    await openSignupSeason(prisma, eu, FORMAT_2V2);

    const users: MatrixUser[] = [];
    for (let i = 0; i < 8; i++) {
      const steamId = steamIdForIndex(i);
      const username = `Signup Player ${i + 1}`;
      await prisma.user.create({
        data: {
          steamId,
          steamUsername: username,
          steamAvatar:
            'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
          permissionLevel: 'GUEST',
          banStatus: 'NONE',
        },
      });
      users.push({ steamId, username });
    }

    return {
      formats,
      allFormatRegions: [na, aus],
      twoV2OnlyRegion: eu,
      users,
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

export function teamNameFor(formatCode: string, regionName: string): string {
  return `${SIGNUP_TEAM_PREFIX}-${formatCode}-${regionName}`.slice(0, 25);
}
