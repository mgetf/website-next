import {
  getTeamsForStandings,
  calculateStandingsStats,
  getTop1v1EntriesForHomepage,
} from '$lib/server/services/teams';
import {
  getLatestSeasonPerRegionByFormat,
  getLeagueGridByFormat,
  type LeagueGrid,
} from '$lib/server/services/seasons';
import { findTopDivisionByRegion } from '$lib/server/services/divisions';
import { getContent, CONTENT_KEYS, getDefaultContent } from '$lib/server/services/siteContent';
import { getGlobalSettings } from '$lib/server/services/settings';
import { getUserDisplaysByIds, fetchSteamNames } from '$lib/server/services/users';
import { getRegions, getLeaderboard } from '$lib/server/clients/mgePlatform';
import { steamId64FromSteamId32 } from '$lib/utils/steamid';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import { TeamStatus } from '$prisma/client.js';

const REGION_ORDER: Record<string, number> = {
  na: 0,
  'north america': 0,
  us: 0,
  eu: 1,
  europe: 1,
  as: 2,
  asia: 2,
  sea: 2,
};

function regionSortKey(name: string): number {
  return REGION_ORDER[name.toLowerCase()] ?? 99;
}

function sortLeagueGrid(grid: LeagueGrid): LeagueGrid {
  return {
    seasonNums: grid.seasonNums,
    rows: [...grid.rows].sort((a, b) => regionSortKey(a.regionName) - regionSortKey(b.regionName)),
  };
}

const emptyLeagueGrid: LeagueGrid = { seasonNums: [], rows: [] };

export const load = async () => {
  try {
    const [
      seasons2v2,
      seasons1v1,
      leagueGrid2v2Raw,
      leagueGrid1v1Raw,
      homepageSubtitle,
      homepageAbout,
      globalSettings,
      platformRegions,
    ] = await Promise.all([
      getLatestSeasonPerRegionByFormat(FORMAT_2V2),
      getLatestSeasonPerRegionByFormat(FORMAT_1V1),
      getLeagueGridByFormat(FORMAT_2V2),
      getLeagueGridByFormat(FORMAT_1V1),
      getContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
      getContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      getGlobalSettings(),
      getRegions(),
    ]);

    const leagueGrid2v2 = sortLeagueGrid(leagueGrid2v2Raw);
    const leagueGrid1v1 = sortLeagueGrid(leagueGrid1v1Raw);

    const standingsStatuses = (
      globalSettings?.standingsVisibleStatuses?.length
        ? globalSettings.standingsVisibleStatuses
        : ['READY', 'PENDING']
    ).filter((s) => s === 'READY' || s === 'PENDING') as TeamStatus[];

    // --- MGE ELO Leaderboard (from platform API) ---
    const eloLeaderboard: {
      region: string;
      entries: { elo: number; steamId64: string; name: string | null; avatar: string | null }[];
    }[] = [];

    if (platformRegions.length > 0) {
      const regionEntries = await Promise.all(
        platformRegions.map((region) => getLeaderboard(region, 10)),
      );

      // Collect all unique Steam64 IDs to batch-lookup names/avatars
      const allSteam64s: string[] = [];
      const regionEntryMaps: {
        region: string;
        entries: { steam32: string; elo: number; platformName: string | null }[];
      }[] = [];

      for (let i = 0; i < platformRegions.length; i++) {
        const rawEntries = regionEntries[i].entries;
        const mapped = rawEntries
          .map((e) => {
            const steam64 = steamId64FromSteamId32(e.steamId);
            return steam64
              ? { steam32: e.steamId, steam64, elo: e.elo, platformName: e.name ?? null }
              : null;
          })
          .filter(
            (
              e,
            ): e is {
              steam32: string;
              steam64: string;
              elo: number;
              platformName: string | null;
            } => e !== null,
          );

        for (const e of mapped) allSteam64s.push(e.steam64);
        regionEntryMaps.push({
          region: platformRegions[i],
          entries: mapped.map((e) => ({
            steam32: e.steam32,
            elo: e.elo,
            platformName: e.platformName,
          })),
        });
      }

      const userDisplays = await getUserDisplaysByIds(allSteam64s);

      // Only call Steam API for entries that have neither a registered profile nor a platform name
      const needsSteamLookup = allSteam64s.filter((id) => {
        if (userDisplays[id]) return false;
        const entry = regionEntryMaps
          .flatMap((r) => r.entries)
          .find((e) => steamId64FromSteamId32(e.steam32) === id);
        return !entry?.platformName;
      });
      const steamNames = needsSteamLookup.length > 0 ? await fetchSteamNames(needsSteamLookup) : {};

      for (const { region, entries } of regionEntryMaps) {
        if (entries.length === 0) continue;
        eloLeaderboard.push({
          region,
          entries: entries.map(({ steam32, elo, platformName }) => {
            const steam64 = steamId64FromSteamId32(steam32) ?? '';
            const display = userDisplays[steam64] ?? null;
            const isRegistered = display !== null;
            return {
              elo,
              steamId64: steam64,
              isRegistered,
              name: display?.name ?? platformName ?? steamNames[steam64] ?? null,
              avatar: display?.avatar ?? null,
            };
          }),
        });
      }
    }

    // --- League Standings (per region, top 3 from Premier) ---
    const buildLeague2v2 = async () => {
      return Promise.all(
        seasons2v2.map(async (season) => {
          const division = await findTopDivisionByRegion(season.regionId);
          if (!division) return null;

          let topTeams: {
            rank: number;
            name: string;
            avatar: string | null;
            record: string;
            points: number;
            id: number;
          }[] = [];

          if (!season.signupsOpen) {
            const teams = await getTeamsForStandings({
              seasonId: season.id,
              divisionId: division.id,
              statuses: standingsStatuses,
              limit: 3,
            });
            topTeams = teams.map((team, index) => {
              const stats = calculateStandingsStats(team);
              return {
                rank: index + 1,
                name: team.name,
                avatar: team.avatar ?? null,
                record: stats.record,
                points: stats.pointsPerGame,
                id: team.id,
              };
            });
          }

          return {
            regionName: season.region.name,
            season: `Season ${season.seasonNum}`,
            signupsOpen: season.signupsOpen,
            topTeams,
          };
        }),
      );
    };

    const buildLeague1v1 = async () => {
      return Promise.all(
        seasons1v1.map(async (season) => {
          const division = await findTopDivisionByRegion(season.regionId);
          if (!division) return null;

          let topEntries: {
            rank: number;
            id: number;
            name: string;
            avatar: string | null;
            steamId: string | null;
            record: string;
            points: number;
          }[] = [];

          if (!season.signupsOpen) {
            const entries = await getTop1v1EntriesForHomepage({
              seasonId: season.id,
              divisionId: division.id,
              limit: 3,
              statuses: standingsStatuses as string[],
            });
            topEntries = entries.map((e) => ({
              rank: e.rank,
              id: e.id,
              name: e.name,
              avatar: e.avatar,
              steamId: e.steamId,
              record: e.record,
              points: e.pointsPerGame,
            }));
          }

          return {
            regionName: season.region.name,
            season: `Season ${season.seasonNum}`,
            signupsOpen: season.signupsOpen,
            topEntries,
          };
        }),
      );
    };

    const [raw2v2, raw1v1] = await Promise.all([buildLeague2v2(), buildLeague1v1()]);

    const leaderboard2v2 = raw2v2
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => regionSortKey(a.regionName) - regionSortKey(b.regionName));
    const leaderboard1v1 = raw1v1
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => regionSortKey(a.regionName) - regionSortKey(b.regionName));

    eloLeaderboard.sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region));

    // Determine if any format has signups open (for signup CTA card)
    const anySignupsOpen2v2 = leaderboard2v2.some((r) => r.signupsOpen);
    const anySignupsOpen1v1 = leaderboard1v1.some((r) => r.signupsOpen);

    return {
      eloLeaderboard,
      leagueGrid2v2,
      leagueGrid1v1,
      leaderboard2v2,
      leaderboard1v1,
      anySignupsOpen2v2,
      anySignupsOpen1v1,
      siteContent: {
        subtitle: homepageSubtitle || getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: homepageAbout || getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  } catch (error) {
    console.error('Error loading homepage:', error);

    return {
      eloLeaderboard: [],
      leagueGrid2v2: emptyLeagueGrid,
      leagueGrid1v1: emptyLeagueGrid,
      leaderboard2v2: [],
      leaderboard1v1: [],
      anySignupsOpen2v2: false,
      anySignupsOpen1v1: false,
      siteContent: {
        subtitle: getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  }
};
