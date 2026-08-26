import {
  getLeaderboard,
  getPlayerRatings,
  type PlatformLeaderboardEntry,
  type LeaderboardSortField,
  type LeaderboardSortDir,
} from '$lib/server/clients/mgePlatform';
import {
  getUserDisplaysByIds,
  fetchSteamNames,
  searchUsersByName,
} from '$lib/server/services/users';
import { steamId64FromSteamId32 } from '$lib/utils/steamid';

const PLATFORM_PAGE_SIZE = 100;

async function fetchAllRegionEntries(
  region: string,
  minElo?: number,
): Promise<{ entries: PlatformLeaderboardEntry[]; total: number }> {
  const first = await getLeaderboard(region, PLATFORM_PAGE_SIZE, 0, minElo);
  const total = first.total;

  if (total <= PLATFORM_PAGE_SIZE) {
    return { entries: first.entries, total };
  }

  const extraPages = Math.ceil((total - PLATFORM_PAGE_SIZE) / PLATFORM_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: extraPages }, (_, i) =>
      getLeaderboard(region, PLATFORM_PAGE_SIZE, (i + 1) * PLATFORM_PAGE_SIZE, minElo),
    ),
  );

  return {
    entries: [...first.entries, ...rest.flatMap((r) => r.entries)],
    total,
  };
}

function getSortKey(e: PlatformLeaderboardEntry, sortBy: LeaderboardSortField): number {
  switch (sortBy) {
    case 'wins':
      return e.wins ?? 0;
    case 'losses':
      return e.losses ?? 0;
    case 'games':
      return (e.wins ?? 0) + (e.losses ?? 0);
    case 'winrate': {
      const total = (e.wins ?? 0) + (e.losses ?? 0);
      return total > 0 ? (e.wins ?? 0) / total : 0;
    }
    case 'lastPlayed':
      return e.lastPlayed ? new Date(e.lastPlayed).getTime() : 0;
    default:
      return e.displayRating ?? e.elo;
  }
}

function ratingFields(
  e: Pick<PlatformLeaderboardEntry, 'elo' | 'rd' | 'volatility' | 'displayRating' | 'provisional'>,
) {
  return {
    elo: e.elo,
    rd: e.rd ?? null,
    volatility: e.volatility ?? null,
    displayRating: e.displayRating ?? e.elo,
    provisional: e.provisional ?? false,
  };
}

export interface EloLeaderboardEntry {
  rank: number;
  region: string;
  steamId64: string;
  name: string | null;
  avatar: string | null;
  elo: number;
  rd: number | null;
  volatility: number | null;
  displayRating: number;
  provisional: boolean;
  wins: number | null;
  losses: number | null;
  lastPlayed: string | null;
  isRegistered: boolean;
}

export interface EloLeaderboardPage {
  entries: EloLeaderboardEntry[];
  total: number;
  totalPages: number;
}

export interface EloLeaderboardParams {
  regions: string[];
  page: number;
  pageSize: number;
  minElo?: number;
  registeredOnly?: boolean;
  sortBy?: LeaderboardSortField;
  sortDir?: LeaderboardSortDir;
}

export async function getEloLeaderboardPage(
  params: EloLeaderboardParams,
): Promise<EloLeaderboardPage> {
  const {
    regions,
    page,
    pageSize,
    minElo,
    registeredOnly,
    sortBy = 'elo',
    sortDir = 'desc',
  } = params;

  const offset = (page - 1) * pageSize;

  if (regions.length === 1) {
    const response = await getLeaderboard(regions[0], pageSize, offset, minElo, sortBy, sortDir);

    if (response.entries.length === 0) {
      return {
        entries: [],
        total: response.total,
        totalPages: Math.ceil(response.total / pageSize) || 0,
      };
    }

    const steam64s = response.entries
      .map((e) => steamId64FromSteamId32(e.steamId))
      .filter((id): id is string => id !== null);

    const userDisplays = await getUserDisplaysByIds(steam64s);

    // Only call Steam API for entries that have neither a platform name nor a registered profile
    const needsSteamLookup = steam64s.filter(
      (id) =>
        !userDisplays[id] &&
        !response.entries.find((e) => steamId64FromSteamId32(e.steamId) === id && e.name),
    );
    const steamNamesForUnregistered =
      needsSteamLookup.length > 0 ? await fetchSteamNames(needsSteamLookup) : {};

    const enriched: EloLeaderboardEntry[] = [];

    for (let i = 0; i < response.entries.length; i++) {
      const e = response.entries[i];
      const steam64 = steamId64FromSteamId32(e.steamId);
      if (!steam64) continue;

      const display = userDisplays[steam64] ?? null;
      const isRegistered = display !== null;
      if (registeredOnly && !isRegistered) continue;

      enriched.push({
        rank: e.eloRank > 0 ? e.eloRank : offset + i + 1,
        region: regions[0],
        steamId64: steam64,
        name: display?.name ?? e.name ?? steamNamesForUnregistered[steam64] ?? null,
        avatar: display?.avatar ?? null,
        ...ratingFields(e),
        wins: e.wins,
        losses: e.losses,
        lastPlayed: e.lastPlayed ? new Date(e.lastPlayed).toISOString() : null,
        isRegistered,
      });
    }

    return {
      entries: enriched,
      total: response.total,
      totalPages: Math.ceil(response.total / pageSize) || 0,
    };
  }

  // Multi-region: fetch all entries from each region, merge, sort in JS, paginate in memory
  const regionResults = await Promise.all(regions.map((r) => fetchAllRegionEntries(r, minElo)));

  type TaggedEntry = PlatformLeaderboardEntry & { sourceRegion: string };
  const tagged: TaggedEntry[] = regionResults.flatMap(({ entries }, i) =>
    entries.map((e) => ({ ...e, sourceRegion: regions[i] })),
  );

  if (tagged.length === 0) {
    return { entries: [], total: 0, totalPages: 0 };
  }

  // Sort direction multiplier: 1 for desc (larger first), -1 for asc (smaller first)
  const dirMult = sortDir === 'asc' ? -1 : 1;

  const sortedTagged = [...tagged].sort((a, b) => {
    const diff = getSortKey(b, sortBy) - getSortKey(a, sortBy);
    return dirMult * diff || (b.displayRating ?? b.elo) - (a.displayRating ?? a.elo);
  });

  if (registeredOnly) {
    // Must check all entries against DB to know who is registered before filtering
    const allSteam64s = sortedTagged
      .map((e) => steamId64FromSteamId32(e.steamId))
      .filter((id): id is string => id !== null);
    const userDisplays = await getUserDisplaysByIds(allSteam64s);

    let rank = 0;
    const filteredRanked: Array<TaggedEntry & { rank: number; steam64: string }> = [];
    for (const e of sortedTagged) {
      const steam64 = steamId64FromSteamId32(e.steamId);
      if (!steam64 || !userDisplays[steam64]) continue;
      rank++;
      filteredRanked.push({ ...e, rank, steam64 });
    }

    const pageSlice = filteredRanked.slice(offset, offset + pageSize);
    const entries: EloLeaderboardEntry[] = pageSlice.map((e) => {
      const display = userDisplays[e.steam64]!;
      return {
        rank: e.rank,
        region: e.sourceRegion,
        steamId64: e.steam64,
        name: display.name,
        avatar: display.avatar,
        ...ratingFields(e),
        wins: e.wins,
        losses: e.losses,
        lastPlayed: e.lastPlayed ? new Date(e.lastPlayed).toISOString() : null,
        isRegistered: true,
      };
    });

    const registeredTotal = filteredRanked.length;
    return {
      entries,
      total: registeredTotal,
      totalPages: Math.ceil(registeredTotal / pageSize) || 0,
    };
  }

  // Common case: sort, paginate, then enrich only the current page
  const total = sortedTagged.length;
  const pageSlice = sortedTagged.slice(offset, offset + pageSize);

  const pageSteam64s = pageSlice
    .map((e) => steamId64FromSteamId32(e.steamId))
    .filter((id): id is string => id !== null);

  const userDisplays = await getUserDisplaysByIds(pageSteam64s);

  // Only call Steam API for entries that have neither a platform name nor a registered profile
  const needsSteamLookup = pageSteam64s.filter(
    (id) =>
      !userDisplays[id] &&
      !pageSlice.find((e) => steamId64FromSteamId32(e.steamId) === id && e.name),
  );
  const steamNamesForUnregistered =
    needsSteamLookup.length > 0 ? await fetchSteamNames(needsSteamLookup) : {};

  const entries: EloLeaderboardEntry[] = [];
  let mergedRank = offset;
  for (const e of pageSlice) {
    const steam64 = steamId64FromSteamId32(e.steamId);
    if (!steam64) continue;
    mergedRank++;
    const display = userDisplays[steam64] ?? null;
    entries.push({
      rank: mergedRank,
      region: e.sourceRegion,
      steamId64: steam64,
      name: display?.name ?? e.name ?? steamNamesForUnregistered[steam64] ?? null,
      avatar: display?.avatar ?? null,
      ...ratingFields(e),
      wins: e.wins,
      losses: e.losses,
      lastPlayed: e.lastPlayed ? new Date(e.lastPlayed).toISOString() : null,
      isRegistered: display !== null,
    });
  }

  return {
    entries,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

export async function searchEloLeaderboard(params: {
  regions: string[];
  search: string;
}): Promise<EloLeaderboardPage> {
  const { regions, search } = params;
  const q = search.trim();
  if (!q) return { entries: [], total: 0, totalPages: 0 };

  const isSteam64 = /^\d{17}$/.test(q);
  const isSteam32 = /^STEAM_\d:\d:\d+$/i.test(q);

  let candidates: { steamId64: string; name: string | null; avatar: string | null }[];

  if (isSteam64 || isSteam32) {
    const steam64 = isSteam32 ? (steamId64FromSteamId32(q) ?? q) : q;
    const displays = await getUserDisplaysByIds([steam64]);
    candidates = [
      {
        steamId64: steam64,
        name: displays[steam64]?.name ?? null,
        avatar: displays[steam64]?.avatar ?? null,
      },
    ];
  } else {
    const users = await searchUsersByName(q, 50);
    candidates = users.map((u) => ({
      steamId64: u.steamId,
      name: u.name,
      avatar: u.avatar,
    }));
  }

  if (candidates.length === 0) return { entries: [], total: 0, totalPages: 0 };

  const regionSet = new Set(regions.map((r) => r.toLowerCase()));

  const results = await Promise.all(
    candidates.map(async ({ steamId64, name, avatar }) => {
      const ratings = await getPlayerRatings(steamId64);
      return ratings
        .filter((r) => regionSet.has(r.region.toLowerCase()))
        .map((r) => ({
          steamId64,
          name,
          avatar,
          region: r.region,
          ...ratingFields(r),
          wins: r.wins,
          losses: r.losses,
          lastPlayed: r.lastPlayed ?? null,
        }));
    }),
  );

  const flat = results.flat();
  if (flat.length === 0) return { entries: [], total: 0, totalPages: 0 };

  flat.sort((a, b) => b.displayRating - a.displayRating);

  const ranked = await Promise.all(
    flat.map(async (e) => {
      const above = await getLeaderboard(e.region, 1, 0, e.displayRating + 1);
      return { ...e, rank: above.total + 1 };
    }),
  );

  const entries: EloLeaderboardEntry[] = ranked.map((e) => ({
    rank: e.rank,
    region: e.region,
    steamId64: e.steamId64,
    name: e.name,
    avatar: e.avatar,
    elo: e.elo,
    rd: e.rd,
    volatility: e.volatility,
    displayRating: e.displayRating,
    provisional: e.provisional,
    wins: e.wins,
    losses: e.losses,
    lastPlayed: e.lastPlayed,
    isRegistered: true,
  }));

  return { entries, total: entries.length, totalPages: 1 };
}
