/**
 * Database Connection Utility
 *
 * When DATA_BACKEND=rama (or RAMA_CONDUCTOR_URL is set with DATA_BACKEND=rama),
 * Postgres/Prisma is disabled — services must use Rama REST helpers.
 *
 * Otherwise: Prisma Client singleton (Prisma v7 + Direct TCP).
 */

import { PrismaClient } from '$prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { dev, building } from '$app/environment';

if (dev && !building) {
  const { config } = await import('dotenv');
  config();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function isRamaBackend(): boolean {
  const flag = (process.env.DATA_BACKEND ?? '').toLowerCase();
  return flag === 'rama' || flag === 'rama-rest';
}

function createPostgresPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const connectionStringWithApp = connectionString.includes('?')
    ? `${connectionString}&application_name=website-next`
    : `${connectionString}?application_name=website-next`;

  const adapter = new PrismaPg({
    connectionString: connectionStringWithApp,
    max: parseInt(process.env.DB_POOL_MAX ?? '10'),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 2_000,
  });

  return new PrismaClient({
    adapter,
    log: dev ? ['error', 'warn'] : ['error'],
  });
}

/** Proxy that fails loudly if any service still touches Prisma under Rama. */
function createRamaBlockedPrisma(): PrismaClient {
  const err = () => {
    throw new Error(
      'Postgres/Prisma is disabled (DATA_BACKEND=rama). Use $lib/server/rama/* REST helpers.',
    );
  };
  return new Proxy({} as PrismaClient, {
    get(_t, prop) {
      if (prop === '$disconnect') return async () => {};
      if (prop === 'then') return undefined;
      return new Proxy(
        {},
        {
          get() {
            return err;
          },
          apply() {
            err();
          },
        },
      );
    },
  });
}

function createPrismaClient(): PrismaClient {
  if (isRamaBackend()) return createRamaBlockedPrisma();
  return createPostgresPrismaClient();
}

export const prisma: PrismaClient = building
  ? (undefined as unknown as PrismaClient)
  : (globalForPrisma.prisma ??= createPrismaClient());

if (!building && typeof window === 'undefined' && !isRamaBackend()) {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
  });
}
