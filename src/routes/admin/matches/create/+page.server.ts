/**
 * Match Creation Wizard - Server Logic
 * Dedicated page for creating matches with a progressive wizard interface
 */

import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getEligibleTeams, createMatchSet } from '$lib/server/services/adminMatches';
import { getSeasons } from '$lib/server/services/seasons';
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
	 * Preview eligible teams and match pairings
	 */
	previewMatches: async ({ request, locals }) => {
		requireAdmin(locals.user);

		const formData = await request.formData();
		const regionId = parseInt(formData.get('regionId') as string);
		const divisionId = parseInt(formData.get('divisionId') as string);
		const seasonId = parseInt(formData.get('seasonId') as string);

		try {
			const teams = await getEligibleTeams(regionId, divisionId, seasonId);

			if (teams.length === 0) {
				return { preview: { teams: [], matchups: [] }, success: true };
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

			return { preview: { teams: teamsWithSeeds, matchups, byeTeam }, success: true };
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

			// Redirect to matches list with success message
			throw redirect(303, `/admin/matches?created=${matches.length}`);
		} catch (err: any) {
			if (err.status === 303) throw err; // Re-throw redirects
			return fail(400, { error: err.message || 'Failed to create matches' });
		}
	}
};

