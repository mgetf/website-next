/**
 * Admin Match Management - Server Logic
 * Bulk match creation, editing, and management
 */

import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { MatchStatus } from '@prisma/client';
import {
	createMatchSet,
	createPlayoffMatch,
	getEligibleTeams,
	getAdminMatches,
	updateMatchStatus,
	adminUpdateScores
} from '$lib/server/services/adminMatches';
import { getMatchWeekLabels } from '$lib/server/services/matches';
import { getSeasons } from '$lib/server/services/seasons';
import { getVisibleDivisions } from '$lib/server/services/divisions';
import { getVisibleRegions } from '$lib/server/services/regions';
import { getMapBanPools } from '$lib/server/services/mapBanPools';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Admin check handled by layout
	requireAdmin(locals.user);

	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;

	// Filters
	const seasonId = url.searchParams.get('seasonId');
	const divisionId = url.searchParams.get('divisionId');
	const regionId = url.searchParams.get('regionId');
	const status = url.searchParams.get('status');
	const weekNo = url.searchParams.get('weekNo');
	const search = url.searchParams.get('search');

	// Fetch matches with filters and pagination
	const { matches, totalCount } = await getAdminMatches({
		filters: { seasonId, divisionId, regionId, status, weekNo, search },
		pagination: { page, limit }
	});

	// Calculate week labels for each match (using service layer)
	const weekLabelMap = await getMatchWeekLabels(matches);
	const matchesWithLabels = matches.map((match) => ({
		...match,
		weekLabel: weekLabelMap.get(match.id) || null
	}));

	// Fetch filter options
	const [seasons, divisions, regions, mapBanPools] = await Promise.all([
		getSeasons(),
		getVisibleDivisions(),
		getVisibleRegions(),
		getMapBanPools()
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

		// Parse game results from form data
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

