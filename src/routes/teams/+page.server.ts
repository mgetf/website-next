import type { PageServerLoad } from './$types';
import { getTeamsPublic } from '$lib/server/services/teams';
import { getRegions } from '$lib/server/services/regions';
import { getSeasons } from '$lib/server/services/seasons';

export const load: PageServerLoad = async ({ url }) => {
	const page = parseInt(url.searchParams.get('page') || '1');
	const search = url.searchParams.get('search') || undefined;
	const regionId = url.searchParams.get('region') ? parseInt(url.searchParams.get('region')!) : undefined;
	const seasonId = url.searchParams.get('season') ? parseInt(url.searchParams.get('season')!) : undefined;

	const [{ teams, pagination }, regions, seasons] = await Promise.all([
		getTeamsPublic(page, search, regionId, seasonId),
		getRegions(),
		getSeasons()
	]);

	return {
		teams,
		pagination,
		regions,
		seasons,
		filters: {
			search: search || '',
			region: regionId || '',
			season: seasonId || ''
		}
	};
};

