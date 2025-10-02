/**
 * Test API Route for Database Connection
 * GET /api/test-db - Tests Prisma connection and queries users
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	try {
		// Test database connection by counting users
		const userCount = await prisma.user.count();
		
		// Get first 5 users as a sample
		const sampleUsers = await prisma.user.findMany({
			take: 5,
			select: {
				steamId: true,
				steamUsername: true,
				permissionLevel: true,
				banStatus: true,
			},
		});

		return json({
			success: true,
			message: 'Database connection successful!',
			stats: {
				userCount,
				sampleUsers,
			},
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error('Database connection error:', error);
		
		return json(
			{
				success: false,
				message: 'Database connection failed',
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
};


