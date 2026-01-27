import { getCurrentSeason } from '$lib/server/services/seasons';
import {
  getTeamsForStandings,
  calculateStandingsStats,
} from '$lib/server/services/teams';
import { getRecentTournamentActivity } from '$lib/server/services/tournaments';
import { TeamStatus } from '$prisma/client.js';
import { findDivisionByName } from '$lib/server/services/divisions';
import {
  getContent,
  CONTENT_KEYS,
  getDefaultContent,
} from '$lib/server/services/siteContent';

export const load = async () => {
  try {
    // Fetch all data in parallel using services
    const [
      season,
      premierDivision,
      tournamentActivity,
      homepageSubtitle,
      homepageAbout,
    ] = await Promise.all([
      getCurrentSeason(),
      findDivisionByName('Premier'),
      getRecentTournamentActivity(),
      getContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
      getContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
    ]);

    // Get top 3 premier division teams for current season
    let topTeams: any[] = [];
    if (season && premierDivision) {
      const teams = await getTeamsForStandings({
        seasonId: season.id,
        divisionId: premierDivision.id,
        statuses: [TeamStatus.READY],
        limit: 3,
      });

      topTeams = teams.map((team, index) => {
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

    // Transform data for the homepage
    return {
      leagueData: {
        season: season ? `Season ${season.seasonNum}` : 'Season 1',
        topTeams,
      },
      tournamentData: {
        recentEvents: tournamentActivity.recentEvents,
        totalCounts: tournamentActivity.totalCounts,
      },
      siteContent: {
        subtitle:
          homepageSubtitle || getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: homepageAbout || getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  } catch (error) {
    console.error('Error loading homepage:', error);

    // Return fallback data if services fail
    return {
      leagueData: {
        season: 'Season 1',
        topTeams: [],
      },
      tournamentData: {
        recentEvents: [],
        totalCounts: {
          cups: 0,
          championships: 0,
          fightNights: 0,
        },
      },
      siteContent: {
        subtitle: getDefaultContent(CONTENT_KEYS.HOMEPAGE_SUBTITLE),
        about: getDefaultContent(CONTENT_KEYS.HOMEPAGE_ABOUT),
      },
    };
  }
};
