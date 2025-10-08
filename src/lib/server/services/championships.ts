/**
 * Championship Service
 * 
 * All championship-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get the latest championship with winner info
 * Used by homepage
 */
export async function getLatestChampionship() {
	const latestChampionship = await prisma.championship.findFirst({
		orderBy: { id: 'desc' },
		select: {
			id: true,
			name: true,
			winner: true,
			status: true,
			startedAt: true,
			endedAt: true,
			avatar: true
		}
	});

	if (!latestChampionship) {
		return null;
	}

	// Get winner info if championship is complete
	let winner = null;
	if (latestChampionship.winner && latestChampionship.status > 0) {
		winner = await prisma.user.findUnique({
			where: { steamId: latestChampionship.winner },
			select: {
				steamId: true,
				steamUsername: true,
				steamAvatar: true
			}
		});
	}

	// Determine next championship date
	let nextDate = 'TBD 2025';
	if (latestChampionship.status === 0) {
		nextDate = 'In Progress';
	} else if (latestChampionship.status === 1) {
		nextDate = 'Completed';
	}

	return {
		id: latestChampionship.id,
		name: latestChampionship.name,
		winner,
		status: latestChampionship.status,
		startedAt: latestChampionship.startedAt,
		endedAt: latestChampionship.endedAt,
		avatar: latestChampionship.avatar,
		nextDate
	};
}

