import { getCurrentSeasonByFormat } from '$lib/server/services/seasons';
import {
  getTeamsForStandings,
  calculateStandingsStats,
  getTop1v1EntriesForHomepage,
} from '$lib/server/services/teams';
import { TeamStatus } from '$prisma/client.js';
import { findDivisionByName } from '$lib/server/services/divisions';
import { getContent, CONTENT_KEYS, getDefaultContent } from '$lib/server/services/siteContent';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';

export const load = async () => {
  try {
    const [season2v2, season1v1, premierDivision, homepageSubtitle, homepageAbout] =
      await Promise.all([
        getCurrentSeasonByFormat(FORMAT_2V2),
        getCurrentSeasonByFormat(FORMAT_1V1),
        findDivisionByName('Premier'),
        getContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        getContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      ]);

    // 2v2 card data
    let topTeams2v2: Array<{
      rank: number;
      name: string;
      record: string;
      points: number;
      id: number;
    }> = [];

    if (season2v2 && !season2v2.signupsOpen && premierDivision) {
      const teams = await getTeamsForStandings({
        seasonId: season2v2.id,
        divisionId: premierDivision.id,
        statuses: [TeamStatus.READY, TeamStatus.PENDING],
        limit: 3,
      });

      topTeams2v2 = teams.map((team, index) => {
        const stats = calculateStandingsStats(team);
        return {
          rank: index + 1,
          name: team.name,
          record: stats.record,
          points: stats.pointsPerGame,
          id: team.id,
        };
      });
    }

    // 1v1 card data
    let topEntries1v1: Array<{
      rank: number;
      id: number;
      name: string;
      avatar: string | null;
      steamId: string | null;
      record: string;
      points: number;
    }> = [];

    if (season1v1 && !season1v1.signupsOpen && premierDivision) {
      const entries = await getTop1v1EntriesForHomepage({
        seasonId: season1v1.id,
        divisionId: premierDivision.id,
        limit: 3,
      });

      topEntries1v1 = entries.map((e) => ({
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
      league2v2Data: {
        season: season2v2 ? `Season ${season2v2.seasonNum}` : 'Season 1',
        signupsOpen: season2v2?.signupsOpen ?? false,
        topTeams: topTeams2v2,
      },
      league1v1Data: {
        season: season1v1 ? `Season ${season1v1.seasonNum}` : 'Season 1',
        signupsOpen: season1v1?.signupsOpen ?? false,
        topEntries: topEntries1v1,
      },
      siteContent: {
        subtitle: homepageSubtitle || getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: homepageAbout || getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  } catch (error) {
    console.error('Error loading homepage:', error);

    return {
      league2v2Data: {
        season: 'Season 1',
        signupsOpen: false,
        topTeams: [],
      },
      league1v1Data: {
        season: 'Season 1',
        signupsOpen: false,
        topEntries: [],
      },
      siteContent: {
        subtitle: getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  }
};
