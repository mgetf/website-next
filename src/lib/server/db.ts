/**
 * Database Connection Utility
 * Prisma Client singleton for SvelteKit (Prisma v7 + Direct TCP)
 *
 * This ensures we don't create multiple instances of Prisma Client
 * in development (which can exhaust database connections)
 */

import { PrismaClient } from '$prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { dev, building } from '$app/environment';

// Load .env file in development (Vite SSR doesn't auto-populate process.env)
if (dev && !building) {
  const { config } = await import('dotenv');
  config();
}

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Explicit pool configuration prevents connection pool exhaustion under SSE load.
  // DB_POOL_MAX defaults to 20; tune based on Railway plan's max_connections.
  // Each SSE stream polls every 15–60 s, so N concurrent users = N/15 q/s at minimum.
  const pool = (globalForPrisma.pgPool ??= new pg.Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX ?? '20'),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  }));

  const adapter = new PrismaPg(pool);
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
  });
}
