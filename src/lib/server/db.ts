/**
 * Database Connection Utility
 * Prisma Client singleton for SvelteKit (Prisma v7 + Direct TCP)
 *
 * This ensures we don't create multiple instances of Prisma Client
 * in development (which can exhaust database connections)
 */

import { PrismaClient } from '$prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { dev, building } from '$app/environment';
import { Pool } from 'pg';

// Load .env file in development (Vite SSR doesn't auto-populate process.env)
if (dev && !building) {
  const { config } = await import('dotenv');
  config();
}

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function parseOptionalInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPoolConfig(connectionString: string) {
  return {
    connectionString,
    max: parseOptionalInt(process.env.DB_POOL_MAX, 15),
    idleTimeoutMillis: parseOptionalInt(process.env.DB_POOL_IDLE_TIMEOUT_MS, 30000),
    connectionTimeoutMillis: parseOptionalInt(process.env.DB_POOL_ACQUIRE_TIMEOUT_MS, 10000),
    maxLifetimeSeconds: parseOptionalInt(process.env.DB_POOL_MAX_LIFETIME_SECONDS, 1800),
  };
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = (globalForPrisma.pgPool ??= new Pool(getPoolConfig(connectionString)));
  const adapter = new PrismaPg(pool, {
    onPoolError: (err) => {
      console.error('[db] pg pool error', {
        name: err.name,
        message: err.message,
      });
    },
    onConnectionError: (err) => {
      console.error('[db] pg connection error', {
        name: err.name,
        message: err.message,
      });
    },
  });

  return new PrismaClient({
    adapter,
    log: dev ? ['error', 'warn'] : ['error'],
  });
}

// During build, export a dummy - actual client created at runtime
// This prevents SvelteKit's build analysis from triggering DB connection
export const prisma: PrismaClient = building
  ? (undefined as unknown as PrismaClient)
  : (globalForPrisma.prisma ??= createPrismaClient());

// Graceful shutdown (only at runtime, not during build)
if (!building && typeof window === 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect();
    if (globalForPrisma.pgPool) {
      await globalForPrisma.pgPool.end();
    }
  });
}

export default prisma;
