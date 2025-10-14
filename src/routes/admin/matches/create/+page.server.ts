/**
 * Match Creation Wizard - Server Logic
 * Dedicated page for creating matches with a progressive wizard interface
 */

import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { 
	getEligibleTeams, 
	createMatchSet, 
	calculateWeekLabel as calculateWeekLabelService 
} from '$lib/server/services/adminMatches';
import { getSeasons, getSeasonById } from '$lib/server/services/seasons';
import { getRegions } from '$lib/server/services/regions';
import { getDivisions } from '$lib/server/services/divisions';
import { getArenas } from '$lib/server/services/arenas';
import { getMapBanPools } from '$lib/server/services/mapBanPools';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);

	// Fetch data for dropdowns using services
	const [seasons, regions, divisions, arenas, mapBanPools] = await Promise.all([
		getSeasons(),
		getRegions(),
		getDivisions(),
		getArenas(),
		getMapBanPools()
	]);

	return {
		seasons,
		regions,
		divisions,
		mapBanPools,
		arenas
	};
};

export const actions: Actions = {
	/**
	 * Preview eligible teams and match pairings (includes week label calculation)
	 */
	previewMatches: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);
		const divisionId = parseInt(formData.get('divisionId') as string);
		const seasonId = parseInt(formData.get('seasonId') as string);
		const weekNoRaw = formData.get('weekNo') as string;
		const weekNo = weekNoRaw && weekNoRaw !== '' ? parseInt(weekNoRaw) : null;
		const isPlayoff = formData.get('isPlayoff') === 'on';

		try {
			const teams = await getEligibleTeams(regionId, divisionId, seasonId);

			if (teams.length === 0) {
				return { preview: { teams: [], matchups: [], weekLabel: null, existingCount: 0 }, success: true };
			}

			// Assign seeds based on sorted order (getEligibleTeams already sorts by wins/losses)
			const teamsWithSeeds = teams.map((team, index) => ({
				...team,
				seed: index + 1
			}));

			// Generate matchups using the pairing algorithm
			const { pairTeamsForMatches } = await import('$lib/server/services/adminMatches');
			const pairedTeams = await pairTeamsForMatches(teams, seasonId);

			// Convert paired teams array into matchup objects
			const matchups = [];
			for (let i = 0; i < pairedTeams.length - 1; i += 2) {
				const homeTeam = pairedTeams[i];
				const awayTeam = pairedTeams[i + 1];

				// Find seeds for these teams
				const homeTeamWithSeed = teamsWithSeeds.find((t) => t.id === homeTeam.id);
				const awayTeamWithSeed = teamsWithSeeds.find((t) => t.id === awayTeam.id);

				matchups.push({
					home: homeTeamWithSeed,
					away: awayTeamWithSeed
				});
			}

			// Check if there's a bye (odd number of teams)
			const byeTeam =
				pairedTeams.length < teams.length
					? teamsWithSeeds.find((t) => !pairedTeams.some((pt) => pt.id === t.id))
					: null;

			// Calculate week label if not playoff and week number provided
			let weekLabel = null;
			let existingCount = 0;
			
			console.log('Week label calculation check:', { weekNo, isPlayoff, shouldCalculate: weekNo && !isPlayoff });
			
			if (weekNo && !isPlayoff) {
				console.log('Calculating week label for:', { regionId, divisionId, seasonId, weekNo });
				const weekLabelData = await calculateWeekLabelService(regionId, divisionId, seasonId, weekNo);
				weekLabel = weekLabelData.weekLabel;
				existingCount = weekLabelData.existingCount;
				console.log('Week label calculated:', { weekLabel, existingCount });
			}

			return { 
				preview: { 
					teams: teamsWithSeeds, 
					matchups, 
					byeTeam,
					weekLabel,
					existingCount
				}, 
				success: true 
			};
		} catch (err: any) {
			return fail(400, { error: err.message || 'Failed to load teams' });
		}
	},

	/**
	 * Create the match set
	 */
	createMatchSet: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();

		const regionId = parseInt(formData.get('regionId') as string);
		const divisionId = parseInt(formData.get('divisionId') as string);
		const seasonId = parseInt(formData.get('seasonId') as string);
		const weekNoRaw = formData.get('weekNo') as string;
		const weekNo = weekNoRaw && weekNoRaw !== '' ? parseInt(weekNoRaw) : null;
		const boSeries = parseInt(formData.get('boSeries') as string);
		const arenaIdRaw = formData.get('arenaId') as string;
		const arenaId = arenaIdRaw && arenaIdRaw !== '' ? parseInt(arenaIdRaw) : undefined;
		const matchDateTime = (formData.get('matchDateTime') as string) || '';
		const mapBanPoolIdRaw = formData.get('mapBanPoolId') as string;
		const mapBanPoolId = mapBanPoolIdRaw && mapBanPoolIdRaw !== '' ? parseInt(mapBanPoolIdRaw) : undefined;
		const isPlayoff = formData.get('isPlayoff') === 'on';

		console.log('Create match set params:', { regionId, divisionId, seasonId, weekNo, boSeries, arenaId, matchDateTime, mapBanPoolId, isPlayoff });

		// Validate required fields
		if (isNaN(regionId) || isNaN(divisionId) || isNaN(seasonId) || isNaN(boSeries)) {
			console.error('Invalid form data:', { regionId, divisionId, seasonId, boSeries });
			return fail(400, { error: 'Invalid form data: missing required fields' });
		}

		try {
			// Get season to extract seasonNo
			const season = await getSeasonById(seasonId);

			if (!season) {
				console.error('Season not found:', seasonId);
				return fail(400, { error: 'Season not found' });
			}

			console.log('Creating match set with params:', {
				regionId,
				divisionId,
				seasonId,
				seasonNo: season.seasonNum,
				weekNo,
				boSeries,
				arenaId,
				matchDateTime,
				mapBanPoolId
			});

			const matches = await createMatchSet(regionId, divisionId, {
				seasonId,
				seasonNo: season.seasonNum,
				weekNo: weekNo || undefined,
				boSeries,
				arenaId,
				matchDateTime,
				mapBanPoolId
			});

			console.log('Successfully created matches:', matches.length);

			// TODO: Send notifications to all team owners (F19)

			// Redirect to matches list with success message
			throw redirect(303, `/admin/matches?created=${matches.length}`);
		} catch (err: any) {
			console.error('Error creating match set:', err);
			if (err.status === 303) throw err; // Re-throw redirects
			return fail(400, { error: err.message || 'Failed to create matches' });
		}
	}
};

