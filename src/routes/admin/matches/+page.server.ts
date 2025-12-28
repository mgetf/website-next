/**
 * Admin Match Management - Server Logic
 * Matches by week view (RGL-style layout)
 */

import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { MatchStatus } from '$prisma/client.js';
import { prisma } from '$lib/server/db';
import {
	createMatchSet,
	createPlayoffMatch,
	getEligibleTeams,
	updateMatchStatus,
	adminUpdateScores
} from '$lib/server/services/adminMatches';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getMapBanPools } from '$lib/server/services/mapBanPools';
import { getMatchWeekLabels } from '$lib/server/services/matches';

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAdmin(locals.user);

	// Get filter params
	const regionIdParam = url.searchParams.get('regionId');
	const seasonIdParam = url.searchParams.get('seasonId');
	const weekParam = url.searchParams.get('week'); // "1", "2", ..., "8", "p1", "p2", etc.

	// Fetch filter options
	const [divisions, regions, mapBanPools] = await Promise.all([
		getVisibleDivisions(),
		getVisibleRegions(),
		getMapBanPools()
	]);

	// Selected region (default to first)
	const selectedRegionId = regionIdParam ? parseInt(regionIdParam) : (regions[0]?.id ?? null);
	
	// Get seasons for the selected region
	const seasons = await prisma.season.findMany({
		where: selectedRegionId ? { regionId: selectedRegionId } : {},
		include: { region: true },
		orderBy: { seasonNum: 'desc' }
	});

	// Selected season (default to most recent for the region)
	const selectedSeasonId = seasonIdParam ? parseInt(seasonIdParam) : (seasons[0]?.id ?? null);
	
	// Parse week param - "p1" = playoffs match 1, "1" = week 1
	let weekNo: number | null = null;
	let playoffRound: number | null = null;
	let isPlayoffs = false;

	if (weekParam) {
		if (weekParam.startsWith('p')) {
			isPlayoffs = true;
			playoffRound = parseInt(weekParam.slice(1));
		} else {
			weekNo = parseInt(weekParam);
		}
	} else {
		// Default to week 1
		weekNo = 1;
	}

	// Fetch available weeks/rounds for this season
	const weekOptions = await getWeekOptionsForSeason(selectedSeasonId);

	// Fetch matches for selected week, grouped by division (show ALL divisions)
	let matchesByDivision: Record<string, any[]> = {};
	
	if (selectedSeasonId) {
		const whereClause: any = {
			seasonId: selectedSeasonId
		};

		if (isPlayoffs && playoffRound !== null) {
			whereClause.playoffRound = playoffRound;
			whereClause.weekNo = null;
		} else if (weekNo !== null) {
			whereClause.weekNo = weekNo;
			whereClause.playoffId = null;
		}

		const matches = await prisma.match.findMany({
			where: whereClause,
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
				playoff: true,
				games: {
					include: { arena: true },
					orderBy: { gameNum: 'asc' }
				}
			},
			orderBy: [{ id: 'asc' }]
		});

		// Get week labels for matches (e.g., "1A", "1B", etc.)
		const weekLabelMap = await getMatchWeekLabels(matches);
		const matchesWithLabels = matches.map((match) => ({
			...match,
			weekLabel: weekLabelMap.get(match.id) || null
		}));

		// Group matches by division
		for (const match of matchesWithLabels) {
			// Skip matches with missing team data
			if (!match.homeTeam || !match.awayTeam) continue;
			
			// Use home team's division as the grouping key
			const divisionName = match.homeTeam.division?.name || 'Unknown Division';
			const divisionId = match.homeTeam.division?.id || 0;
			const divisionKey = `${divisionId}:${divisionName}`;
			
			if (!matchesByDivision[divisionKey]) {
				matchesByDivision[divisionKey] = [];
			}
			matchesByDivision[divisionKey].push(match);
		}
	}

	// Sort divisions: highest to lowest (higher ID = higher division like Invite, lower ID = Newcomer)
	const sortedDivisions = Object.entries(matchesByDivision)
		.sort(([keyA], [keyB]) => {
			const idA = parseInt(keyA.split(':')[0]);
			const idB = parseInt(keyB.split(':')[0]);
			return idB - idA; // Descending by ID = highest division first
		})
		.map(([key, matches]) => ({
			name: key.split(':')[1],
			id: parseInt(key.split(':')[0]),
			matches
		}));

	return {
		matchesByDivision: sortedDivisions,
		seasons,
		divisions,
		regions,
		mapBanPools,
		weekOptions,
		filters: {
			regionId: selectedRegionId?.toString() ?? null,
			seasonId: selectedSeasonId?.toString() ?? null,
			week: weekParam ?? '1'
		}
	};
};

/**
 * Get available weeks and playoff rounds for a season
 */
async function getWeekOptionsForSeason(seasonId: number | null): Promise<{ value: string; label: string }[]> {
	if (!seasonId) return [];

	// Get distinct week numbers and playoff rounds
	const [weekMatches, playoffMatches] = await Promise.all([
		prisma.match.findMany({
			where: {
				seasonId,
				weekNo: { not: null }
			},
			select: { weekNo: true },
			distinct: ['weekNo'],
			orderBy: { weekNo: 'asc' }
		}),
		prisma.match.findMany({
			where: {
				seasonId,
				playoffRound: { not: null }
			},
			select: { playoffRound: true },
			distinct: ['playoffRound'],
			orderBy: { playoffRound: 'asc' }
		})
	]);

	const options: { value: string; label: string }[] = [];

	// Add week options
	for (const m of weekMatches) {
		if (m.weekNo !== null) {
			options.push({
				value: m.weekNo.toString(),
				label: `Week ${m.weekNo}`
			});
		}
	}

	// Add playoff options
	for (const m of playoffMatches) {
		if (m.playoffRound !== null) {
			options.push({
				value: `p${m.playoffRound}`,
				label: `Playoffs Match ${m.playoffRound}`
			});
		}
	}

	// If no options found, return default weeks 1-8
	if (options.length === 0) {
		for (let i = 1; i <= 8; i++) {
			options.push({ value: i.toString(), label: `Week ${i}` });
		}
	}

	return options;
}

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

		let newStatus: MatchStatus;
		if (statusNum === 0) newStatus = MatchStatus.UNPLAYED;
		else if (statusNum === 1) newStatus = MatchStatus.PLAYED;
		else if (statusNum === 2) newStatus = MatchStatus.DISPUTE;
		else return fail(400, { error: 'Invalid status' });

		try {
			await updateMatchStatus(matchId, newStatus);

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

		const gameResults = [];
		for (let i = 0; i < 10; i++) {
			const homeScoreStr = formData.get(`homeScore_${i}`) as string;
			const awayScoreStr = formData.get(`awayScore_${i}`) as string;
			
			if (homeScoreStr && awayScoreStr) {
				const homeScore = parseInt(homeScoreStr);
				const awayScore = parseInt(awayScoreStr);
				
				if (!isNaN(homeScore) && !isNaN(awayScore)) {
					gameResults.push({ gameNum: i + 1, homeScore, awayScore });
				}
			}
		}

		if (gameResults.length === 0) {
			return fail(400, { error: 'No valid scores provided' });
		}

		try {
			await adminUpdateScores(matchId, gameResults);
			return { success: true, message: 'Scores updated successfully' };
		} catch (err: any) {
			return fail(500, { error: err.message || 'Failed to update scores' });
		}
	}
};
