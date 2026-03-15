import type { PageServerLoad } from './$types';
import { getTeamsPublic } from '$lib/server/services/teams';
import { getRegions } from '$lib/server/services/regions';
import { getSeasons } from '$lib/server/services/seasons';
import { FORMAT_2V2 } from '$lib/server/constants/formats';

export const load: PageServerLoad = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const search = url.searchParams.get('search') || undefined;
  const regionId = url.searchParams.get('region')
    ? parseInt(url.searchParams.get('region')!)
    : undefined;
  const seasonId = url.searchParams.get('season')
    ? parseInt(url.searchParams.get('season')!)
    : undefined;

  const [{ teams, pagination }, regions, allSeasons] = await Promise.all([
    getTeamsPublic(page, search, regionId, seasonId),
    getRegions(),
    getSeasons(),
  ]);

  const seasons = allSeasons.filter((s) => s.formatId === FORMAT_2V2);

  return {
    teams,
    pagination,
    regions,
    seasons,
    filters: {
      search: search || '',
      region: regionId || '',
      season: seasonId || '',
    },
  };
};
