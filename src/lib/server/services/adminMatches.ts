/**
 * Admin Match Management Service
 * Match creation, bulk operations, and admin-only functions
 */

import { prisma } from '$lib/server/db';
import type { Team } from '@prisma/client';
import { MatchStatus, TeamStatus } from '@prisma/client';
import { error } from '@sveltejs/kit';
import { calculateWinLossRatio, calculatePointsPerGame } from '$lib/server/utils/matchHelpers';

/**
 * Sort teams by standings
 * Priority: wins → win/loss ratio → points per game
 */
export function sortTeamsByStandings(teams: Team[]): Team[] {
	return teams.sort((a, b) => {
		// Primary: wins
		if (a.wins !== b.wins) {
			return b.wins - a.wins;
		}

		// Secondary: win/loss ratio
		const ratioA = calculateWinLossRatio(a.wins, a.losses);
		const ratioB = calculateWinLossRatio(b.wins, b.losses);
		if (ratioA !== ratioB) {
			return ratioB - ratioA;
		}

		// Tertiary: points per game
		const ppgA = calculatePointsPerGame(a.pointsScored, a.gamesWon, a.gamesLost);
		const ppgB = calculatePointsPerGame(b.pointsScored, b.gamesWon, b.gamesLost);
		return ppgB - ppgA;
	});
}

/**
 * Pair teams for matches, avoiding repeat matchups
 * Returns array of teams paired in order [team1, team2, team3, team4, ...]
 */
export async function pairTeamsForMatches(teams: Team[], seasonId: number): Promise<Team[]> {
	const sortedTeams = sortTeamsByStandings(teams);
	const finalTeams: Team[] = [];

	console.log(`\n=== Pairing ${sortedTeams.length} teams for matches ===`);

	for (let i = 0; i < sortedTeams.length; i++) {
		const currentTeam = sortedTeams[i];

		if (finalTeams.some((team) => team.id === currentTeam.id)) {
			continue;
		}

		let x = 1;
		let playedAll = 0;
		let foundMatch = false;

		while (!foundMatch) {
			if (i + x >= sortedTeams.length) {
				x = 1;
				playedAll++;

				if (playedAll > 100) {
					console.log(`Team ${currentTeam.name} has played everyone multiple times`);
					break;
				}
				continue;
			}

			const potentialOpponent = sortedTeams[i + x];

			if (finalTeams.some((team) => team.id === potentialOpponent.id)) {
				x++;
				continue;
			}

			// Check existing matches between these teams
			const existingMatches = await prisma.match.findMany({
				where: {
					seasonId,
					OR: [
						{
							homeTeamId: currentTeam.id,
							awayTeamId: potentialOpponent.id
						},
						{
							homeTeamId: potentialOpponent.id,
							awayTeamId: currentTeam.id
						}
					]
				}
			});

			if (existingMatches.length <= playedAll) {
				finalTeams.push(currentTeam);
				finalTeams.push(potentialOpponent);
				foundMatch = true;
			}

			x++;
		}
	}

	console.log(`\n=== Paired ${finalTeams.length / 2} matches ===`);
	return finalTeams;
}

interface CreateMatchSetParams {
	seasonId: number;
	seasonNo: number;
	weekNo?: number;
	boSeries: number;
	arenaId?: number;
	matchDateTime?: string;
	mapBanPoolId?: number;
}

/**
 * Create a set of regular season matches
 */
export async function createMatchSet(
	regionId: number,
	divisionId: number,
	params: CreateMatchSetParams
) {
	const { seasonId, seasonNo, weekNo, boSeries, arenaId, matchDateTime, mapBanPoolId } = params;

	// Get global settings for payment requirement
	const globalSettings = await prisma.global.findFirst();
	const paymentRequired = globalSettings?.paymentRequired === 1;

	// Build conditions for team selection
	const conditions: any = {
		regionId,
		divisionId,
		seasonId,
		status: TeamStatus.READY
	};

	if (paymentRequired) {
		conditions.paymentStatus = 1; // PAID
	}

	// Get eligible teams
	const teams = await prisma.team.findMany({
		where: conditions
	});

	if (teams.length < 2) {
		throw error(400, 'Not enough eligible teams for match creation');
	}

	// Pair teams
	const pairedTeams = await pairTeamsForMatches(teams, seasonId);

	if (pairedTeams.length === 0) {
		throw error(400, 'No valid team pairings found');
	}

	// Create matches
	const matches = [];
	for (let i = 0; i < pairedTeams.length - 1; i += 2) {
		const homeTeam = pairedTeams[i];
		const awayTeam = pairedTeams[i + 1];

		const match = await prisma.match.create({
			data: {
				homeTeamId: homeTeam.id,
				awayTeamId: awayTeam.id,
				seasonId,
				seasonNo,
				weekNo,
				boSeries,
				matchDateTime: matchDateTime ? new Date(matchDateTime) : null,
				status: MatchStatus.UNPLAYED
			}
		});

		// Create games for this match
		for (let gameNum = 1; gameNum <= boSeries; gameNum++) {
			await prisma.game.create({
				data: {
					matchId: match.id,
					gameNum,
					arenaId: arenaId || null
				}
			});
		}

		// Create initial match comm with instructions
		await prisma.matchComm.create({
			data: {
				matchId: match.id,
				owner: '76561199005229176', // System user
				content: `Match Created! Important Information:

1. Contact: Please reach out to your opponent via Discord or Steam.
2. Demo Required: You must record a demo of your match.
3. Servers: Check #match-servers in Discord for official server information.
4. Rules: Review the rulebook at https://mge.tf/rulebook
5. Issue Resolution:
  - First, check the rulebook
  - Then, communicate with your opponent
  - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!`,
				createdAt: Math.floor(Date.now() / 1000)
			}
		});

		// Initialize map ban phase if pool specified
		if (mapBanPoolId) {
			await prisma.matchMapBan.create({
				data: {
					matchId: match.id,
					poolId: mapBanPoolId,
					currentTurn: 0, // Starts with away team (will ban first)
					banPhaseComplete: false
				}
			});
		}

		// TODO: Send notifications to team owners (F19)

		matches.push(match);
	}

	return matches;
}

interface CreatePlayoffMatchParams {
	seasonId: number;
	seasonNo: number;
	playoffId: number;
	playoffRound: number;
	homeTeamId: number;
	awayTeamId: number;
	boSeries: number;
	boGames?: number;
	arenaId?: number;
	matchDateTime?: string;
	mapBanPoolId?: number;
}

/**
 * Create a single playoff match
 */
export async function createPlayoffMatch(params: CreatePlayoffMatchParams) {
	const {
		seasonId,
		seasonNo,
		playoffId,
		playoffRound,
		homeTeamId,
		awayTeamId,
		boSeries,
		boGames,
		arenaId,
		matchDateTime,
		mapBanPoolId
	} = params;

	// Verify playoff exists
	const playoff = await prisma.playoff.findUnique({
		where: { id: playoffId }
	});

	if (!playoff) {
		throw error(404, 'Playoff not found');
	}

	// Create match
	const match = await prisma.match.create({
		data: {
			homeTeamId,
			awayTeamId,
			seasonId,
			seasonNo,
			playoffId,
			playoffRound,
			weekNo: null,
			boSeries,
			boGames: boGames || null,
			matchDateTime: matchDateTime ? new Date(matchDateTime) : null,
			status: MatchStatus.UNPLAYED
		}
	});

	// Create games (accounting for boGames if specified)
	const gamesPerArena = boGames || 1;
	const totalGames = boSeries * gamesPerArena;

	for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
		await prisma.game.create({
			data: {
				matchId: match.id,
				gameNum,
				arenaId: arenaId || null
			}
		});
	}

	// Create initial match comm
	await prisma.matchComm.create({
		data: {
			matchId: match.id,
			owner: '76561199005229176', // System user
			content: `Match Created! Important Information:

1. Contact: Please reach out to your opponent via Discord or Steam.
2. Demo Required: You must record a demo of your match.
3. Servers: Check #match-servers in Discord for official server information.
4. Rules: Review the rulebook at https://mge.tf/rulebook
5. Issue Resolution:
  - First, check the rulebook
  - Then, communicate with your opponent
  - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!`,
			createdAt: Math.floor(Date.now() / 1000)
		}
	});

	// Initialize map ban phase if pool specified
	if (mapBanPoolId) {
		await prisma.matchMapBan.create({
			data: {
				matchId: match.id,
				poolId: mapBanPoolId,
				currentTurn: 0,
				banPhaseComplete: false
			}
		});
	}

	// TODO: Send notifications to team owners (F19)

	return match;
}

/**
 * Get teams eligible for match creation
 * 
 * NOTE: We intentionally do NOT filter by seasonId here, matching v1 behavior.
 * This is because:
 * - Teams may not have seasonId updated immediately when registered
 * - Teams can participate in matches across seasons
 * - The seasonId on teams serves a different purpose than match eligibility
 * 
 * Instead, we filter by region, division, and READY status.
 */
export async function getEligibleTeams(regionId: number, divisionId: number, seasonId: number) {
	const globalSettings = await prisma.global.findFirst();
	const paymentRequired = globalSettings?.paymentRequired === 1;

	const conditions: any = {
		regionId,
		divisionId,
		status: TeamStatus.READY
	};

	if (paymentRequired) {
		conditions.paymentStatus = 1;
	}

	return await prisma.team.findMany({
		where: conditions,
		include: {
			division: true,
			region: true
		},
		orderBy: [
			{ wins: 'desc' },
			{ losses: 'asc' }
		]
	});
}

/**
 * Calculate the week label for a new match set
 * Returns the week number with suffix (e.g., "3b" if Week 3a already exists)
 */
export async function calculateWeekLabel(
	regionId: number,
	divisionId: number,
	seasonId: number,
	weekNo: number
): Promise<{ weekLabel: string; existingCount: number }> {
	// Find all matches for this week/season where both teams are in the same region/division
	const existingMatches = await prisma.match.findMany({
		where: {
			weekNo,
			seasonId,
			homeTeam: {
				regionId,
				divisionId
			},
			awayTeam: {
				regionId,
				divisionId
			}
		},
		select: { id: true },
		orderBy: { id: 'asc' }
	});

	console.log('Found existing matches:', existingMatches.length);

	// Group matches into sets by checking for gaps in IDs
	// Matches created together have sequential IDs
	let matchSetCount = 0;
	if (existingMatches.length > 0) {
		let lastId = existingMatches[0].id;
		matchSetCount = 1;

		for (let i = 1; i < existingMatches.length; i++) {
			if (existingMatches[i].id - lastId > 10) {
				// Gap detected, new match set
				matchSetCount++;
			}
			lastId = existingMatches[i].id;
		}
	}

	// Calculate suffix
	let weekLabel = weekNo.toString();
	if (matchSetCount > 0) {
		const suffixChar = String.fromCharCode('a'.charCodeAt(0) + matchSetCount);
		weekLabel = `${weekNo}${suffixChar}`;
	}

	console.log('Week label:', weekLabel, 'Match sets:', matchSetCount);

	return { weekLabel, existingCount: matchSetCount };
}

