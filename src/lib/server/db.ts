/**
 * Database Connection Utility
 * Prisma Client singleton for SvelteKit (Prisma v7 + Direct TCP)
 *
 * This ensures we don't create multiple instances of Prisma Client
 * in development (which can exhaust database connections)
 */

import { PrismaClient } from '$prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { dev } from '$app/environment';
import { DATABASE_URL } from '$env/static/private';

// Create adapter with Direct TCP connection
const adapter = new PrismaPg({ connectionString: DATABASE_URL });

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter,
		log: dev ? ['query', 'error', 'warn'] : ['error']
	});

if (dev) globalForPrisma.prisma = prisma;

// Graceful shutdown
if (typeof window === 'undefined') {
	process.on('beforeExit', async () => {
		await prisma.$disconnect();
	});
}

export default prisma;
