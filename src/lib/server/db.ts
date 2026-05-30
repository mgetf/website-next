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

// Load .env file in development (Vite SSR doesn't auto-populate process.env)
if (dev && !building) {
  const { config } = await import('dotenv');
  config();
}

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Append application_name so pg_stat_activity can attribute connections to this service,
  // enabling per-service audits against the shared connection budget.
  const connectionStringWithApp = connectionString.includes('?')
    ? `${connectionString}&application_name=website-next`
    : `${connectionString}?application_name=website-next`;

  // Pass PoolConfig directly so @prisma/adapter-pg creates the pool using its own
  // bundled pg version. Avoids cross-package Pool instance contamination in production
  // where the adapter ships pg as a regular (non-peer) dependency.
  //
  // DB_POOL_MAX budget (2 replicas): 2 × (10 pool + 1 hub listener) = 22 steady-state;
  // × 4 at Railway deploy overlap = 44; + ~23 sibling services ≈ 67 of 97 usable connections.
  // Do not raise DB_POOL_MAX above 10 without recalculating against max_connections.
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
