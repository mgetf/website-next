import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

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
			const currentSeason = await prisma.season.findFirst({
				orderBy: { seasonNum: 'desc' }
			});
			seasonId = currentSeason?.id;
		} else if (seasonParam) {
			seasonId = parseInt(seasonParam);
		}

		// Get division ID (support "premier" keyword)
		let divisionId: number | undefined;
		if (divisionParam === 'premier') {
			const premierDivision = await prisma.division.findFirst({
				where: { hidden: 0 },
				orderBy: { id: 'asc' }
			});
			divisionId = premierDivision?.id;
		} else if (divisionParam) {
			divisionId = parseInt(divisionParam);
		}

		// Build where clause
		const where: any = {
			status: 2 // READY status only
		};

		if (seasonId) where.seasonId = seasonId;
		if (divisionId) where.divisionId = divisionId;
		if (regionParam) where.regionId = parseInt(regionParam);

		// Fetch teams
		const teams = await prisma.team.findMany({
			where,
			select: {
				id: true,
				name: true,
				acronym: true,
				avatar: true,
				wins: true,
				losses: true,
				pointsScored: true,
				pointsScoredAgainst: true,
				gamesWon: true,
				gamesLost: true,
				division: {
					select: {
						id: true,
						name: true
					}
				},
				region: {
					select: {
						id: true,
						name: true
					}
				}
			},
			orderBy: [
				{ wins: 'desc' },
				{ losses: 'asc' },
				{ pointsScored: 'desc' }
			],
			take: limit
		});

		// Calculate derived fields
		const standings = teams.map((team, index) => {
			const totalGames = team.gamesWon + team.gamesLost;
			const ppg = totalGames > 0 ? (team.pointsScored / totalGames).toFixed(1) : '0.0';
			const winRate = team.wins + team.losses > 0 
				? ((team.wins / (team.wins + team.losses)) * 100).toFixed(1)
				: '0.0';

			return {
				rank: index + 1,
				id: team.id,
				name: team.name,
				acronym: team.acronym,
				avatar: team.avatar,
				wins: team.wins,
				losses: team.losses,
				record: `${team.wins}-${team.losses}`,
				gamesWon: team.gamesWon,
				gamesLost: team.gamesLost,
				pointsScored: team.pointsScored,
				pointsScoredAgainst: team.pointsScoredAgainst,
				pointsPerGame: parseFloat(ppg),
				winRate: parseFloat(winRate),
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

