/**
 * Users Service
 * 
 * All user-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

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
			left: pt.leftAt !== '0' ? new Date(parseInt(pt.leftAt)) : null
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
	const [playerTeams, tournaments, fightNightMatchups] = await Promise.all([
		getPlayerTeams(steamId),
		getPlayerTournamentPlacements(steamId),
		getPlayerFightNightMatchups(steamId)
	]);

	// Transform data
	const currentTeams = transformCurrentTeams(playerTeams);
	const teamHistory = transformTeamHistory(playerTeams);
	const tournamentResults = transformTournamentPlacements(tournaments, steamId);
	const fightNights = transformFightNightMatchups(fightNightMatchups, steamId);
	const achievements = buildAchievements(tournamentResults);

	return {
		player: {
			steamId: user.steamId,
			name: user.steamUsername,
			avatar: user.steamAvatar,
			discordLinked: !!user.discord,
			permissionLevel: user.permissionLevel,
			memberSince: user.discord?.playerSteamId ? new Date() : new Date() // TODO: Track user creation date
		},
		currentTeams,
		teamHistory,
		tournaments: tournamentResults,
		fightNights,
		achievements
	};
}

