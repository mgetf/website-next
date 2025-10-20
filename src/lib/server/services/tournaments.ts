/**
 * Tournament Service
 * 
 * All tournament-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all tournaments (cups) ordered by most recent first
 */
export async function getAllTournaments() {
	const tournaments = await prisma.tournament.findMany({
		orderBy: { startedAt: 'desc' },
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
			isTeamTournament: true,
			winner1: {
				select: {
					steamId: true,
					steamUsername: true,
					steamAvatar: true
				}
			},
			winner2: {
				select: {
					steamId: true,
					steamUsername: true,
					steamAvatar: true
				}
			}
		}
	});

	return tournaments;
}

/**
 * Get a single tournament by ID with full details including winners
 */
export async function getTournamentById(id: number) {
	const tournament = await prisma.tournament.findUnique({
		where: { id },
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

	if (!tournament) {
		return null;
	}

	// Get winner users if they exist
	const [winner1, winner2, secondPlace1, secondPlace2, thirdPlace1, thirdPlace2] = await Promise.all([
		tournament.winner1SteamId ? prisma.user.findUnique({ 
			where: { steamId: tournament.winner1SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null,
		tournament.winner2SteamId ? prisma.user.findUnique({
			where: { steamId: tournament.winner2SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null,
		tournament.secondPlace1SteamId ? prisma.user.findUnique({
			where: { steamId: tournament.secondPlace1SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null,
		tournament.secondPlace2SteamId ? prisma.user.findUnique({
			where: { steamId: tournament.secondPlace2SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null,
		tournament.thirdPlace1SteamId ? prisma.user.findUnique({
			where: { steamId: tournament.thirdPlace1SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null,
		tournament.thirdPlace2SteamId ? prisma.user.findUnique({
			where: { steamId: tournament.thirdPlace2SteamId },
			select: { steamId: true, steamUsername: true, steamAvatar: true }
		}) : null
	]);

	return {
		...tournament,
		winner1,
		winner2,
		secondPlace1,
		secondPlace2,
		thirdPlace1,
		thirdPlace2
	};
}

/**
 * Get all Fight Night events ordered by most recent first
 */
export async function getAllFightNights() {
	const fightNights = await prisma.fightNight.findMany({
		orderBy: { startedAt: 'desc' },
		select: {
			id: true,
			card: true,
			description: true,
			prizepool: true,
			startedAt: true,
			matchups: {
				select: {
					id: true,
					orderNum: true,
					winnerId: true,
					winnerScore: true,
					loserScore: true,
					boSeries: true,
					player1: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					},
					player2: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					},
					winner: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					}
				},
				orderBy: { orderNum: 'asc' }
			}
		}
	});

	return fightNights;
}

/**
 * Get a single Fight Night by ID with full details
 */
export async function getFightNightById(id: number) {
	const fightNight = await prisma.fightNight.findUnique({
		where: { id },
		include: {
			matchups: {
				include: {
					player1: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					},
					player2: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					},
					winner: {
						select: {
							steamId: true,
							steamUsername: true,
							steamAvatar: true
						}
					},
					games: {
						include: {
							arena: {
								select: {
									id: true,
									name: true,
									imageUrl: true
								}
							}
						},
						orderBy: { gameNumber: 'asc' }
					}
				},
				orderBy: { orderNum: 'asc' }
			}
		}
	});

	return fightNight;
}

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

