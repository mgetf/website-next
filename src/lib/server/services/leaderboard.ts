import {
  getLeaderboard,
  getRegions,
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

const MULTI_REGION_FETCH_LIMIT = 200;

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
      return e.elo;
  }
}

export interface EloLeaderboardEntry {
  rank: number;
  region: string;
  steamId64: string;
  name: string | null;
  avatar: string | null;
  elo: number;
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
    const unregisteredIds = steam64s.filter((id) => !userDisplays[id]);
    const steamNamesForUnregistered = await fetchSteamNames(unregisteredIds);

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
        name: display?.name ?? steamNamesForUnregistered[steam64] ?? null,
        avatar: display?.avatar ?? null,
        elo: e.elo,
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

  // Multi-region: fetch up to MULTI_REGION_FETCH_LIMIT from each, merge, sort in JS, paginate in memory
  const responses = await Promise.all(
    regions.map((r) => getLeaderboard(r, MULTI_REGION_FETCH_LIMIT, 0, minElo, sortBy, sortDir)),
  );

  type TaggedEntry = PlatformLeaderboardEntry & { sourceRegion: string };
  const tagged: TaggedEntry[] = responses.flatMap((resp, i) =>
    resp.entries.map((e) => ({ ...e, sourceRegion: regions[i] })),
  );

  if (tagged.length === 0) {
    return { entries: [], total: 0, totalPages: 0 };
  }

  const allSteam64s = [
    ...new Set(
      tagged
        .map((e) => steamId64FromSteamId32(e.steamId))
        .filter((id): id is string => id !== null),
    ),
  ];

  const userDisplays = await getUserDisplaysByIds(allSteam64s);
  const unregisteredIds = allSteam64s.filter((id) => !userDisplays[id]);
  const steamNamesForUnregistered = await fetchSteamNames(unregisteredIds);

  // Sort direction multiplier: 1 for desc (larger first), -1 for asc (smaller first)
  const dirMult = sortDir === 'asc' ? -1 : 1;

  const sortedTagged = [...tagged].sort((a, b) => {
    const diff = getSortKey(b, sortBy) - getSortKey(a, sortBy);
    return dirMult * diff || b.elo - a.elo;
  });

  const allEnriched: EloLeaderboardEntry[] = [];

  for (let i = 0; i < sortedTagged.length; i++) {
    const e = sortedTagged[i];
    const steam64 = steamId64FromSteamId32(e.steamId);
    if (!steam64) continue;

    const display = userDisplays[steam64] ?? null;
    const isRegistered = display !== null;
    if (registeredOnly && !isRegistered) continue;

    allEnriched.push({
      rank: e.eloRank > 0 ? e.eloRank : i + 1,
      region: e.sourceRegion,
      steamId64: steam64,
      name: display?.name ?? steamNamesForUnregistered[steam64] ?? null,
      avatar: display?.avatar ?? null,
      elo: e.elo,
      wins: e.wins,
      losses: e.losses,
      lastPlayed: e.lastPlayed ? new Date(e.lastPlayed).toISOString() : null,
      isRegistered,
    });
  }

  const total = allEnriched.length;
  const entries = allEnriched.slice(offset, offset + pageSize);

  return {
    entries,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

export { getRegions };

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
          elo: r.elo,
          wins: r.wins,
          losses: r.losses,
          lastPlayed: r.lastPlayed ?? null,
        }));
    }),
  );

  const flat = results.flat();
  if (flat.length === 0) return { entries: [], total: 0, totalPages: 0 };

  flat.sort((a, b) => b.elo - a.elo);

  const ranked = await Promise.all(
    flat.map(async (e) => {
      const above = await getLeaderboard(e.region, 1, 0, e.elo + 1);
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
    wins: e.wins,
    losses: e.losses,
    lastPlayed: e.lastPlayed,
    isRegistered: true,
  }));

  return { entries, total: entries.length, totalPages: 1 };
}
