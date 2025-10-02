/**
 * Database Connection Utility
 * Prisma Client singleton for SvelteKit
 * 
 * This ensures we don't create multiple instances of Prisma Client
 * in development (which can exhaust database connections)
 */

import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
	log: dev ? ['query', 'error', 'warn'] : ['error'],
});

if (dev) globalForPrisma.prisma = prisma;

// Graceful shutdown
if (typeof window === 'undefined') {
	process.on('beforeExit', async () => {
		await prisma.$disconnect();
	});
}

export default prisma;


