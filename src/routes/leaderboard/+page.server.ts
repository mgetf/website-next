import type { PageServerLoad } from './$types';
import { getEloLeaderboardPage, searchEloLeaderboard } from '$lib/server/services/leaderboard';
import { getRegions } from '$lib/server/clients/mgePlatform';
import type { LeaderboardSortField, LeaderboardSortDir } from '$lib/server/clients/mgePlatform';

const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

const VALID_SORT_FIELDS: LeaderboardSortField[] = [
  'elo',
  'wins',
  'losses',
  'games',
  'winrate',
  'lastPlayed',
];

export const load: PageServerLoad = async ({ url }) => {
  const availableRegions = await getRegions();
  const defaultRegion = availableRegions[0] ?? '';

  const regionParam = url.searchParams.get('region');
  const rawRegion = (typeof regionParam === 'string' && regionParam) || defaultRegion;
  const regions = rawRegion
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && availableRegions.includes(r));
  const safeRegions = regions.length > 0 ? regions : defaultRegion ? [defaultRegion] : [];

  const search = url.searchParams.get('search')?.trim() ?? '';

  if (search) {
    const { entries, total, totalPages } = await searchEloLeaderboard({
      regions: safeRegions,
      search,
    });
    return {
      entries,
      total,
      totalPages,
      regions: availableRegions,
      filters: {
        regions: safeRegions,
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
        minElo: null,
        registeredOnly: false,
        sortBy: 'elo' as LeaderboardSortField,
        sortDir: 'desc' as LeaderboardSortDir,
        search,
      },
    };
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const rawPageSize = parseInt(url.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE));
  const pageSize: 25 | 50 | 100 = (PAGE_SIZES as ReadonlyArray<number>).includes(rawPageSize)
    ? (rawPageSize as 25 | 50 | 100)
    : DEFAULT_PAGE_SIZE;

  const rawMinElo = url.searchParams.get('minElo');
  const parsedMinElo = rawMinElo ? parseInt(rawMinElo) : NaN;
  const minElo = !isNaN(parsedMinElo) && parsedMinElo > 0 ? parsedMinElo : undefined;

  const registeredOnly = url.searchParams.get('registeredOnly') === '1';

  const rawSortBy = url.searchParams.get('sortBy') ?? 'elo';
  const sortBy: LeaderboardSortField = VALID_SORT_FIELDS.includes(rawSortBy as LeaderboardSortField)
    ? (rawSortBy as LeaderboardSortField)
    : 'elo';
  const rawSortDir = url.searchParams.get('sortDir') ?? 'desc';
  const sortDir: LeaderboardSortDir = rawSortDir === 'asc' ? 'asc' : 'desc';

  const { entries, total, totalPages } = await getEloLeaderboardPage({
    regions: safeRegions,
    page,
    pageSize,
    minElo,
    registeredOnly,
    sortBy,
    sortDir,
  });

  return {
    entries,
    total,
    totalPages,
    regions: availableRegions,
    filters: {
      regions: safeRegions,
      page,
      pageSize,
      minElo: minElo ?? null,
      registeredOnly,
      sortBy,
      sortDir,
      search: '',
    },
  };
};
