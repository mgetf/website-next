import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { TeamStatus } from '$prisma/client.js';
import { getCurrentSeason } from '$lib/server/services/seasons';
import { findDivisionByName } from '$lib/server/services/divisions';
import { getTeamsForStandings, calculateStandingsStats } from '$lib/server/services/teams';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Parse query parameters
		const limitParam = url.searchParams.get('limit');
		const divisionParam = url.searchParams.get('division');
		const seasonParam = url.searchParams.get('season');
		const regionParam = url.searchParams.get('region');

		const limit = limitParam ? parseInt(limitParam) : undefined;

		// Get season ID (if "current", fetch current season)
		let seasonId: number | undefined;
		if (seasonParam === 'current') {
			const currentSeason = await getCurrentSeason();
			seasonId = currentSeason?.id;
		} else if (seasonParam) {
			seasonId = parseInt(seasonParam);
		}

	// Get division ID (support "premier" keyword)
	let divisionId: number | undefined;
	if (divisionParam === 'premier') {
		const premierDivision = await findDivisionByName('Premier');
		divisionId = premierDivision?.id;
	} else if (divisionParam) {
		divisionId = parseInt(divisionParam);
	}

	// Fetch teams
		const teams = await getTeamsForStandings({
			seasonId,
			regionId: regionParam ? parseInt(regionParam) : undefined,
			divisionId,
			statuses: [TeamStatus.READY],
			limit
		});

		// Calculate derived fields
		const standings = teams.map((team, index) => {
			const stats = calculateStandingsStats(team);

			return {
				rank: index + 1,
				id: team.id,
				name: team.name,
				acronym: team.acronym,
				avatar: team.avatar,
				wins: team.wins,
				losses: team.losses,
				record: stats.record,
				gamesWon: team.gamesWon,
				gamesLost: team.gamesLost,
				pointsScored: team.pointsScored,
				pointsScoredAgainst: team.pointsScoredAgainst,
				pointsPerGame: stats.pointsPerGame,
				winRate: stats.winRate,
				division: team.division,
				region: team.region
			};
		});

		return json(standings);
	} catch (err) {
		console.error('Error fetching team standings:', err);
		throw error(500, 'Failed to fetch team standings');
	}
};

