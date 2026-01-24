/**
 * Users Service
 * 
 * All user-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_2V2, FORMAT_1V1 } from '$lib/server/constants/formats';

/**
 * Get user by Steam ID with basic info
 */
export async function getUserBySteamId(steamId: string) {
	return await prisma.user.findUnique({
		where: { steamId },
		include: {
			discord: true
		}
	});
}

/**
 * Get player's team memberships (current and past)
 */
export async function getPlayerTeams(steamId: string) {
	return await prisma.playerInTeam.findMany({
		where: { playerSteamId: steamId },
		include: {
			team: {
				include: {
					division: true,
					region: true,
					season: true
				}
			}
		},
		orderBy: {
			startedAt: 'desc'
		}
	});
}

/**
 * Get player's active 2v2 team (for navigation display)
 * Prioritizes teams in current signup seasons, falls back to any active team
 * Returns null if player is not in an active 2v2 team
 */
export async function getUserActiveTeam(steamId: string): Promise<{ id: number; name: string } | null> {
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	
	// First, try to find a team in the current signup season
	if (currentSeasonIds.length > 0) {
		const currentSeasonTeam = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: steamId,
				active: 1,
				team: {
					formatId: FORMAT_2V2,
					seasonId: {
						in: currentSeasonIds
					}
				}
			},
			include: {
				team: {
					select: {
						id: true,
						name: true
					}
				}
			}
		});
		
		if (currentSeasonTeam?.team) {
			return currentSeasonTeam.team;
		}
	}
	
	// Fall back to any active team (for users only in old season teams)
	const teamMembership = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				formatId: FORMAT_2V2
			}
		},
		include: {
			team: {
				select: {
					id: true,
					name: true
				}
			}
		}
	});

	return teamMembership?.team || null;
}

/**
 * Get player's 1v1 entries (for profile display)
 * Returns all 1v1 "teams" the player has created (current and past)
 */
export async function getPlayer1v1Entries(steamId: string) {
	return await prisma.playerInTeam.findMany({
		where: {
			playerSteamId: steamId,
			team: {
				formatId: FORMAT_1V1
			}
		},
		include: {
			team: {
				include: {
					division: true,
					region: true,
					season: true
				}
			}
		},
		orderBy: {
			startedAt: 'desc'
		}
	});
}

/**
 * Get player's tournament placements (1st, 2nd, 3rd place finishes)
 */
export async function getPlayerTournamentPlacements(steamId: string) {
	return await prisma.tournament.findMany({
		where: {
			OR: [
				{ winner1SteamId: steamId },
				{ winner2SteamId: steamId },
				{ secondPlace1SteamId: steamId },
				{ secondPlace2SteamId: steamId },
				{ thirdPlace1SteamId: steamId },
				{ thirdPlace2SteamId: steamId }
			]
		},
		orderBy: {
			startedAt: 'desc'
		}
	});
}

/**
 * Get player's Fight Night matchups
 */
export async function getPlayerFightNightMatchups(steamId: string) {
	return await prisma.fightNightMatchup.findMany({
		where: {
			OR: [{ player1SteamId: steamId }, { player2SteamId: steamId }]
		},
		include: {
			fightNight: true,
			player1: true,
			player2: true
		},
		orderBy: {
			id: 'desc'
		}
	});
}

/**
 * Transform player teams into current teams list
 */
export function transformCurrentTeams(playerTeams: any[]) {
	return playerTeams
		.filter((pt) => pt.active === 1)
		.map((pt) => ({
			teamId: pt.team.id,
			teamName: pt.team.name,
			division: pt.team.division?.name || 'N/A',
			regionName: pt.team.region?.name || 'N/A',
			seasonNum: pt.team.season?.seasonNum || 0,
			wins: pt.team.wins,
			losses: pt.team.losses,
			totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
			joined: pt.startedAt,
			permissionLevel: pt.permissionLevel
		}));
}

/**
 * Transform player teams into team history list
 */
export function transformTeamHistory(playerTeams: any[]) {
	return playerTeams
		.filter((pt) => pt.active === 0)
		.map((pt) => ({
			teamId: pt.team.id,
			teamName: pt.team.name,
			division: pt.team.division?.name || 'N/A',
			regionName: pt.team.region?.name || 'N/A',
			seasonNum: pt.team.season?.seasonNum || 0,
			wins: pt.team.wins,
			losses: pt.team.losses,
			totalRecord: `${pt.team.wins} - ${pt.team.losses}`,
			joined: pt.startedAt,
			left: pt.leftAt
		}));
}

/**
 * Transform tournaments into placement results
 */
export function transformTournamentPlacements(tournaments: any[], steamId: string) {
	return tournaments.map((tournament) => {
		let placement = 'Participant';
		if (
			tournament.winner1SteamId === steamId ||
			tournament.winner2SteamId === steamId
		) {
			placement = '1st Place';
		} else if (
			tournament.secondPlace1SteamId === steamId ||
			tournament.secondPlace2SteamId === steamId
		) {
			placement = '2nd Place';
		} else if (
			tournament.thirdPlace1SteamId === steamId ||
			tournament.thirdPlace2SteamId === steamId
		) {
			placement = '3rd Place';
		}

		return {
			id: tournament.id,
			name: tournament.name,
			date: tournament.startedAt,
			placement
		};
	});
}

/**
 * Transform Fight Night matchups for player profile
 */
export function transformFightNightMatchups(matchups: any[], steamId: string) {
	return matchups.map((matchup) => {
		const isPlayer1 = matchup.player1SteamId === steamId;
		const opponent = isPlayer1 ? matchup.player2 : matchup.player1;
		const result = matchup.winnerId === steamId ? 'W' : matchup.winnerId ? 'L' : 'TBD';

		return {
			id: matchup.id,
			fightNightName: matchup.fightNight?.card || `Fight Night #${matchup.fightNightId}`,
			opponent: opponent?.steamUsername || 'Unknown',
			result,
			score: matchup.winnerScore && matchup.loserScore
				? `${matchup.winnerScore} - ${matchup.loserScore}`
				: 'TBD',
			date: matchup.fightNight?.startedAt || null
		};
	});
}

/**
 * Build achievements from tournament placements
 * Only includes podium finishes (1st, 2nd, 3rd)
 */
export function buildAchievements(tournamentResults: any[]) {
	return tournamentResults
		.filter((t) => t.placement !== 'Participant')
		.map((t) => ({
			placement: t.placement,
			event: t.name,
			date: t.date
		}));
}

/**
 * Get complete player profile data
 * Used by player/[steamId] page
 */
export async function getPlayerProfile(steamId: string) {
	// Fetch user basic info
	const user = await getUserBySteamId(steamId);

	if (!user) {
		return null;
	}

	// Fetch all related data in parallel
	const [playerTeams, tournaments, fightNightMatchups, player1v1Entries] = await Promise.all([
		getPlayerTeams(steamId),
		getPlayerTournamentPlacements(steamId),
		getPlayerFightNightMatchups(steamId),
		getPlayer1v1Entries(steamId)
	]);

	// Transform data
	const currentTeams = transformCurrentTeams(playerTeams);
	const teamHistory = transformTeamHistory(playerTeams);
	const tournamentResults = transformTournamentPlacements(tournaments, steamId);
	const fightNights = transformFightNightMatchups(fightNightMatchups, steamId);
	const achievements = buildAchievements(tournamentResults);

	// Transform 1v1 entries
	// For 1v1, only 2 states are valid: READY (active) or DEAD (withdrawn)
	// The player IS the team - if the team is READY, the entry is active
	const current1v1Entry = player1v1Entries.find((e) => e.team.status === 'READY');
	const entries1v1 = player1v1Entries.map((entry) => ({
		id: entry.team.id,
		active: entry.team.status === 'READY',
		division: entry.team.division?.name || 'Unknown',
		region: entry.team.region?.name || 'Unknown',
		seasonNum: entry.team.season?.seasonNum || 0,
		wins: entry.team.wins,
		losses: entry.team.losses,
		startedAt: entry.startedAt,
		leftAt: entry.leftAt
	}));

	return {
		player: {
			steamId: user.steamId,
			name: user.steamUsername,
			avatar: user.steamAvatar,
			discordLinked: !!user.discord,
			discordUsername: user.discord?.discordUsername || null,
			permissionLevel: user.permissionLevel
		},
		currentTeams,
		teamHistory,
		tournaments: tournamentResults,
		fightNights,
		achievements,
		// 1v1 League data
		current1v1Entry: current1v1Entry
			? {
					id: current1v1Entry.team.id,
					division: current1v1Entry.team.division?.name || 'Unknown',
					region: current1v1Entry.team.region?.name || 'Unknown',
					seasonNum: current1v1Entry.team.season?.seasonNum || 0,
					wins: current1v1Entry.team.wins,
					losses: current1v1Entry.team.losses
				}
			: null,
		entries1v1
	};
}

/**
 * Get all users with optional filtering and pagination
 * Used by admin panel user management
 */
export async function getUsers(options: {
	search?: string;
	permissionLevel?: string;
	banStatus?: string;
	page?: number;
	pageSize?: number;
}) {
	const { search, permissionLevel, banStatus, page = 1, pageSize = 20 } = options;

	const where: any = {};

	// Search filter
	if (search && search.trim().length > 0) {
		where.OR = [
			{ steamUsername: { contains: search, mode: 'insensitive' } },
			{ steamId: { contains: search } }
		];
	}

	// Permission level filter
	if (permissionLevel && permissionLevel !== 'all') {
		where.permissionLevel = permissionLevel;
	}

	// Ban status filter
	if (banStatus && banStatus !== 'all') {
		where.banStatus = banStatus;
	}

	return await prisma.user.findMany({
		where,
		include: {
			discord: true,
			moderator: {
				include: {
					division: true
				}
			}
		},
		orderBy: {
			steamUsername: 'asc'
		},
		skip: (page - 1) * pageSize,
		take: pageSize
	});
}

/**
 * Count users with optional filtering
 */
export async function countUsers(options: {
	search?: string;
	permissionLevel?: string;
	banStatus?: string;
}) {
	const { search, permissionLevel, banStatus } = options;

	const where: any = {};

	// Search filter
	if (search && search.trim().length > 0) {
		where.OR = [
			{ steamUsername: { contains: search, mode: 'insensitive' } },
			{ steamId: { contains: search } }
		];
	}

	// Permission level filter
	if (permissionLevel && permissionLevel !== 'all') {
		where.permissionLevel = permissionLevel;
	}

	// Ban status filter
	if (banStatus && banStatus !== 'all') {
		where.banStatus = banStatus;
	}

	return await prisma.user.count({ where });
}

/**
 * Update user's permission level and ban status
 * Admin only operation
 */
export async function updateUser(
	steamId: string,
	data: {
		permissionLevel?: string;
		banStatus?: string;
		nameOverride?: number;
	}
) {
	// Check if user exists
	const user = await prisma.user.findUnique({
		where: { steamId }
	});

	if (!user) {
		throw new Error('User not found');
	}

	const updateData: any = {};

	if (data.permissionLevel !== undefined) {
		updateData.permissionLevel = data.permissionLevel;
	}

	if (data.banStatus !== undefined) {
		updateData.banStatus = data.banStatus;
	}

	if (data.nameOverride !== undefined) {
		updateData.nameOverride = data.nameOverride;
	}

	return await prisma.user.update({
		where: { steamId },
		data: updateData
	});
}

/**
 * Ban a user with a reason
 */
export async function banUser(
	steamId: string,
	bannedBy: string,
	severity: 'WARNING' | 'SUSPENDED' | 'BANNED',
	reason: string,
	duration?: number
) {
	// Update user's ban status
	await prisma.user.update({
		where: { steamId },
		data: {
			banStatus: severity
		}
	});

	// Create punishment record
	return await prisma.punishment.create({
		data: {
			playerSteamId: steamId,
			punishedBy: bannedBy,
			severity,
			reason,
			duration,
			startDateTime: new Date(),
			status: 1 // Active
		}
	});
}

/**
 * Get all users for public listing with pagination
 * Used by /users page
 */
export async function getUsersPublic(page: number = 1, search?: string, role?: string) {
	const USERS_PER_PAGE = 50;
	const skip = (page - 1) * USERS_PER_PAGE;

	const where: any = {};

	if (search && search.trim().length > 0) {
		where.OR = [
			{ steamUsername: { contains: search, mode: 'insensitive' } },
			{ steamId: { contains: search, mode: 'insensitive' } },
			{ discord: { discordUsername: { contains: search, mode: 'insensitive' } } }
		];
	}

	if (role && role !== 'all' && role !== '') {
		where.permissionLevel = role;
	}

	const [users, totalCount] = await Promise.all([
		prisma.user.findMany({
			where,
			select: {
				steamId: true,
				steamUsername: true,
				steamAvatar: true,
				permissionLevel: true,
				banStatus: true,
				discord: {
					select: {
						discordUsername: true
					}
				}
			},
			orderBy: {
				steamUsername: 'asc'
			},
			skip,
			take: USERS_PER_PAGE
		}),
		prisma.user.count({ where })
	]);

	const totalPages = Math.ceil(totalCount / USERS_PER_PAGE);

	return {
		users,
		pagination: {
			currentPage: page,
			totalPages,
			totalCount,
			perPage: USERS_PER_PAGE,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1
		}
	};
}

