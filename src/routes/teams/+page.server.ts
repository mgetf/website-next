import type { PageServerLoad } from './$types';
import { getTeamsPublic } from '$lib/server/services/teams';
import { getRegions } from '$lib/server/services/regions';
import { getSeasons } from '$lib/server/services/seasons';
import { getFormatsForFilter } from '$lib/server/services/formats';
import { buildPageSeo } from '$lib/utils/seo';

export const load: PageServerLoad = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1');
  const search = url.searchParams.get('search') || undefined;
  const regionId = url.searchParams.get('region')
    ? parseInt(url.searchParams.get('region')!)
    : undefined;
  const seasonId = url.searchParams.get('season')
    ? parseInt(url.searchParams.get('season')!)
    : undefined;
  const requestedFormatId = url.searchParams.get('format')
    ? parseInt(url.searchParams.get('format')!)
    : undefined;

  const [regions, allSeasons, allFormats] = await Promise.all([
    getRegions(),
    getSeasons(),
    getFormatsForFilter(),
  ]);

  const formats = allFormats.filter((f) => !f.isIndividual);
  const formatId = formats.some((f) => f.id === requestedFormatId) ? requestedFormatId : undefined;

  const { teams, pagination } = await getTeamsPublic(page, search, regionId, seasonId, formatId);

  const seasons = allSeasons.filter((s) =>
    formatId ? s.formatId === formatId : formats.some((f) => f.id === s.formatId),
  );

  return {
    seo: buildPageSeo(url.origin, {
      title: 'Teams | MGE.tf',
      description: 'Browse all MGE.tf teams',
    }),
    teams,
    pagination,
    regions,
    seasons,
    formats: formats.map((f) => ({ id: f.id, name: f.name })),
    filters: {
      search: search || '',
      region: regionId || '',
      season: seasonId || '',
      format: formatId || '',
    },
  };
};
