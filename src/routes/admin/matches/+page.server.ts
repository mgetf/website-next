/**
 * Admin Match Management - Server Logic
 * Bulk match creation, editing, and management
 */

import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { prisma } from '$lib/server/db';
import { requireAdmin } from '$lib/server/auth/permissions';
import { MatchStatus } from '@prisma/client';
import {
	createMatchSet,
	createPlayoffMatch,
	getEligibleTeams
} from '$lib/server/services/adminMatches';
import { updateTeamStats, reverseTeamStats, getMatchWeekLabels } from '$lib/server/services/matches';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Admin check handled by layout
	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;
	const skip = (page - 1) * limit;

	// Filters
	const seasonId = url.searchParams.get('seasonId');
	const divisionId = url.searchParams.get('divisionId');
	const regionId = url.searchParams.get('regionId');
	const status = url.searchParams.get('status');
	const weekNo = url.searchParams.get('weekNo');
	const search = url.searchParams.get('search');

	// Build where clause
	const where: any = {};
	if (seasonId) where.seasonId = parseInt(seasonId);
	if (status) {
		const statusNum = parseInt(status);
		// Convert integer to MatchStatus enum
		if (statusNum === 0) where.status = MatchStatus.UNPLAYED;
		else if (statusNum === 1) where.status = MatchStatus.PLAYED;
		else if (statusNum === 2) where.status = MatchStatus.DISPUTE;
	}
	if (weekNo) where.weekNo = parseInt(weekNo);

	// Team-based filters
	if (divisionId || regionId || search) {
		const teamWhere: any = {};
		if (divisionId) teamWhere.divisionId = parseInt(divisionId);
		if (regionId) teamWhere.regionId = parseInt(regionId);
		if (search) {
			teamWhere.OR = [
				{ name: { contains: search, mode: 'insensitive' } },
				{ acronym: { contains: search, mode: 'insensitive' } }
			];
		}

		if (Object.keys(teamWhere).length > 0) {
			where.OR = [{ homeTeam: teamWhere }, { awayTeam: teamWhere }];
		}
	}

	// Fetch matches
	const [matches, totalCount] = await Promise.all([
		prisma.match.findMany({
			where,
			include: {
				homeTeam: {
					include: { division: true, region: true }
				},
				awayTeam: {
					include: { division: true, region: true }
				},
				season: {
					include: { region: true }
				},
				playoff: true
			},
			orderBy: [{ id: 'desc' }],
			skip,
			take: limit
		}),
		prisma.match.count({ where })
	]);

	// Calculate week labels for each match (using service layer)
	const weekLabelMap = await getMatchWeekLabels(matches);
	const matchesWithLabels = matches.map((match) => ({
		...match,
		weekLabel: weekLabelMap.get(match.id) || null
	}));

	// Fetch filter options
	const [seasons, divisions, regions, mapBanPools] = await Promise.all([
		prisma.season.findMany({
			include: { region: true },
			orderBy: [{ id: 'desc' }]
		}),
		prisma.division.findMany({
			where: { hidden: 0 },
			orderBy: { name: 'asc' }
		}),
		prisma.region.findMany({
			where: { hidden: 0 },
			orderBy: { name: 'asc' }
		}),
		prisma.mapBanPool.findMany({
			where: { isActive: true },
			orderBy: { name: 'asc' }
		})
	]);

	const totalPages = Math.ceil(totalCount / limit);

	return {
		matches: matchesWithLabels,
		seasons,
		divisions,
		regions,
		mapBanPools,
		pagination: {
			page,
			totalPages,
			totalCount,
			hasNext: page < totalPages,
			hasPrev: page > 1
		},
		filters: {
			seasonId,
			divisionId,
			regionId,
			status,
			weekNo,
			search
		}
	};
};

export const actions: Actions = {
	/**
	 * Preview match pairings before creation
	 */
	previewMatches: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);
		const divisionId = parseInt(formData.get('divisionId') as string);
		const seasonId = parseInt(formData.get('seasonId') as string);

		try {
			const teams = await getEligibleTeams(regionId, divisionId, seasonId);

			return { preview: { teams }, success: true };
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to load teams' });
		}
	},

	/**
	 * Create regular season matches
	 */
	createMatchSet: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();

		const regionId = parseInt(formData.get('regionId') as string);
		const divisionId = parseInt(formData.get('divisionId') as string);
		const seasonId = parseInt(formData.get('seasonId') as string);
		const seasonNo = parseInt(formData.get('seasonNo') as string);
		const weekNo = parseInt(formData.get('weekNo') as string);
		const boSeries = parseInt(formData.get('boSeries') as string);
		const arenaId = formData.get('arenaId') ? parseInt(formData.get('arenaId') as string) : undefined;
		const matchDateTime = formData.get('matchDateTime') as string;
		const mapBanPoolId = formData.get('mapBanPoolId')
			? parseInt(formData.get('mapBanPoolId') as string)
			: undefined;

		try {
			const matches = await createMatchSet(regionId, divisionId, {
				seasonId,
				seasonNo,
				weekNo,
				boSeries,
				arenaId,
				matchDateTime,
				mapBanPoolId
			});

			// TODO: Send notifications to all team owners (F19)

			return {
				success: true,
				message: `Created ${matches.length} matches successfully`
			};
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to create matches' });
		}
	},

	/**
	 * Create single playoff match
	 */
	createPlayoffMatch: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();

		const seasonId = parseInt(formData.get('seasonId') as string);
		const seasonNo = parseInt(formData.get('seasonNo') as string);
		const playoffId = parseInt(formData.get('playoffId') as string);
		const playoffRound = parseInt(formData.get('playoffRound') as string);
		const homeTeamId = parseInt(formData.get('homeTeamId') as string);
		const awayTeamId = parseInt(formData.get('awayTeamId') as string);
		const boSeries = parseInt(formData.get('boSeries') as string);
		const boGames = formData.get('boGames') ? parseInt(formData.get('boGames') as string) : undefined;
		const arenaId = formData.get('arenaId') ? parseInt(formData.get('arenaId') as string) : undefined;
		const matchDateTime = formData.get('matchDateTime') as string;
		const mapBanPoolId = formData.get('mapBanPoolId')
			? parseInt(formData.get('mapBanPoolId') as string)
			: undefined;

		try {
			const match = await createPlayoffMatch({
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
			});

			// TODO: Send notifications to team owners (F19)

			return {
				success: true,
				message: `Playoff match created successfully`,
				matchId: match.id
			};
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to create playoff match' });
		}
	},

	/**
	 * Update match status (resolve disputes, force status changes)
	 */
	updateMatchStatus: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const matchId = parseInt(formData.get('matchId') as string);
		const statusNum = parseInt(formData.get('status') as string);

		// Convert integer to MatchStatus enum
		let newStatus: MatchStatus;
		if (statusNum === 0) newStatus = MatchStatus.UNPLAYED;
		else if (statusNum === 1) newStatus = MatchStatus.PLAYED;
		else if (statusNum === 2) newStatus = MatchStatus.DISPUTE;
		else return fail(400, { error: 'Invalid status' });

		try {
			await prisma.match.update({
				where: { id: matchId },
				data: { status: newStatus }
			});

			return { success: true, message: 'Match status updated' };
		} catch (err: any) {
			return fail(500, { error: 'Failed to update match status' });
		}
	},

	/**
	 * Admin score override (reverses old stats and applies new)
	 */
	updateScores: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const matchId = parseInt(formData.get('matchId') as string);

		const match = await prisma.match.findUnique({
			where: { id: matchId },
			include: {
				homeTeam: true,
				awayTeam: true,
				games: true
			}
		});

		if (!match) {
			return fail(404, { error: 'Match not found' });
		}

		// If match was already played, reverse old stats
		if (match.winnerId) {
			const previousHomeWins = match.games.filter(
				(g) => g.homeTeamScore && g.awayTeamScore && g.homeTeamScore > g.awayTeamScore
			).length;
			const previousAwayWins = match.games.filter(
				(g) => g.homeTeamScore && g.awayTeamScore && g.awayTeamScore > g.homeTeamScore
			).length;
			const previousHomePoints = match.games.reduce((sum, g) => sum + (g.homeTeamScore || 0), 0);
			const previousAwayPoints = match.games.reduce((sum, g) => sum + (g.awayTeamScore || 0), 0);

			// Reverse home team stats
			await reverseTeamStats(match.homeTeamId, {
				wins: match.winnerId === match.homeTeamId ? 1 : 0,
				losses: match.winnerId === match.awayTeamId ? 1 : 0,
				gamesWon: previousHomeWins,
				gamesLost: previousAwayWins,
				pointsScored: previousHomePoints,
				pointsScoredAgainst: previousAwayPoints
			});

			// Reverse away team stats
			await reverseTeamStats(match.awayTeamId, {
				wins: match.winnerId === match.awayTeamId ? 1 : 0,
				losses: match.winnerId === match.homeTeamId ? 1 : 0,
				gamesWon: previousAwayWins,
				gamesLost: previousHomeWins,
				pointsScored: previousAwayPoints,
				pointsScoredAgainst: previousHomePoints
			});
		}

		// Parse and apply new scores (same logic as submitScores)
		const gameResults = [];
		for (let i = 0; i < (match.boSeries || 3); i++) {
			const homeScore = parseInt(formData.get(`homeScore_${i}`) as string);
			const awayScore = parseInt(formData.get(`awayScore_${i}`) as string);

			if (!isNaN(homeScore) && !isNaN(awayScore)) {
				gameResults.push({ gameNum: i + 1, homeScore, awayScore });

				// Update game
				await prisma.game.updateMany({
					where: { matchId, gameNum: i + 1 },
					data: { homeTeamScore: homeScore, awayTeamScore: awayScore }
				});
			}
		}

		// Calculate new winner
		const homeWins = gameResults.filter((g) => g.homeScore > g.awayScore).length;
		const awayWins = gameResults.filter((g) => g.awayScore > g.homeScore).length;
		const homePoints = gameResults.reduce((sum, g) => sum + g.homeScore, 0);
		const awayPoints = gameResults.reduce((sum, g) => sum + g.awayScore, 0);

		let winnerId: number | null = null;
		let winnerScore = 0;
		let loserScore = 0;

		if (homeWins > awayWins) {
			winnerId = match.homeTeamId;
			winnerScore = homeWins;
			loserScore = awayWins;
		} else if (awayWins > homeWins) {
			winnerId = match.awayTeamId;
			winnerScore = awayWins;
			loserScore = homeWins;
		}

		// Apply new team stats
		await updateTeamStats(match.homeTeamId, {
			wins: winnerId === match.homeTeamId ? 1 : 0,
			losses: winnerId === match.awayTeamId ? 1 : 0,
			gamesWon: homeWins,
			gamesLost: awayWins,
			pointsScored: homePoints,
			pointsScoredAgainst: awayPoints
		});

		await updateTeamStats(match.awayTeamId, {
			wins: winnerId === match.awayTeamId ? 1 : 0,
			losses: winnerId === match.homeTeamId ? 1 : 0,
			gamesWon: awayWins,
			gamesLost: homeWins,
			pointsScored: awayPoints,
			pointsScoredAgainst: homePoints
		});

		// Update match
		await prisma.match.update({
			where: { id: matchId },
			data: {
				winnerId,
				winnerScore,
				loserScore,
				status: MatchStatus.PLAYED
			}
		});

		return { success: true, message: 'Scores updated successfully' };
	}
};

