/**
 * Tournament Service
 * 
 * All tournament-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get the latest tournament with winner info
 * Used by homepage
 */
export async function getLatestTournament() {
	const latestTournament = await prisma.tournament.findFirst({
		orderBy: { id: 'desc' },
		select: {
			id: true,
			name: true,
			description: true,
			bracketLink: true,
			avatar: true,
			startedAt: true,
			winner1SteamId: true,
			winner2SteamId: true,
			secondPlace1SteamId: true,
			secondPlace2SteamId: true,
			thirdPlace1SteamId: true,
			thirdPlace2SteamId: true,
			isTeamTournament: true
		}
	});

	if (!latestTournament) {
		return null;
	}

	// Get winner info if exists
	let winner = null;
	if (latestTournament.winner1SteamId) {
		winner = await prisma.user.findUnique({
			where: { steamId: latestTournament.winner1SteamId },
			select: {
				steamId: true,
				steamUsername: true,
				steamAvatar: true
			}
		});
	}

	// Format winner date
	let winnerDate = 'TBD';
	if (latestTournament.startedAt) {
		try {
			const date = new Date(latestTournament.startedAt);
			if (!isNaN(date.getTime())) {
				winnerDate = date.toLocaleDateString('en-US', {
					month: 'long',
					year: 'numeric'
				});
			} else {
				winnerDate = 'Recently';
			}
		} catch {
			winnerDate = 'Recently';
		}
	}

	return {
		id: latestTournament.id,
		name: latestTournament.name,
		description: latestTournament.description,
		bracketLink: latestTournament.bracketLink,
		avatar: latestTournament.avatar,
		startedAt: latestTournament.startedAt,
		winner,
		winnerDate,
		prizePool: '$250', // TODO: Add to database schema if needed
		isTeamTournament: latestTournament.isTeamTournament
	};
}

