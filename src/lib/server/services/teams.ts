/**
 * Team Service
 *
 * All team-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import type { Prisma } from '$prisma/client.js';
import { FORMAT_2V2 } from '$lib/server/constants/formats';

/**
 * Get teams with filtering, search, and pagination
 * Used by admin teams page
 */
export async function getTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
  page?: number;
  pageSize?: number;
}) {
  const {
    search,
    divisionId,
    regionId,
    status,
    seasonId,
    page = 1,
    pageSize = 20,
  } = options;

  // Build where clause
  const where: Prisma.TeamWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (divisionId) where.divisionId = divisionId;
  if (regionId) where.regionId = regionId;
  if (status) where.status = status;
  if (seasonId) where.seasonId = seasonId;

  const teams = await prisma.team.findMany({
    where,
    include: {
      division: {
        select: {
          id: true,
          name: true,
        },
      },
      region: {
        select: {
          id: true,
          name: true,
        },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
        },
      },
      _count: {
        select: {
          homeMatches: true,
          awayMatches: true,
        },
      },
    },
    orderBy: [{ status: 'desc' }, { wins: 'desc' }, { losses: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return teams;
}

/**
 * Get teams for public listing with pagination
 */
export async function getTeamsPublic(
  page: number = 1,
  search?: string,
  regionId?: number,
  seasonId?: number,
) {
  const TEAMS_PER_PAGE = 50;
  const skip = (page - 1) * TEAMS_PER_PAGE;

  const where: Prisma.TeamWhereInput = { formatId: FORMAT_2V2 };

  if (search && search.trim().length > 0) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (regionId) {
    where.regionId = regionId;
  }

  if (seasonId) {
    where.seasonId = seasonId;
  }

  const [teams, totalCount] = await Promise.all([
    prisma.team.findMany({
      where,
      select: {
        id: true,
        name: true,
        acronym: true,
        avatar: true,
        wins: true,
        losses: true,
        status: true,
        division: {
          select: {
            id: true,
            name: true,
          },
        },
        region: {
          select: {
            id: true,
            name: true,
          },
        },
        season: {
          select: {
            id: true,
            seasonNum: true,
          },
        },
        _count: {
          select: {
            players: {
              where: { active: 1 },
            },
          },
        },
      },
      orderBy: [{ wins: 'desc' }, { losses: 'asc' }],
      skip,
      take: TEAMS_PER_PAGE,
    }),
    prisma.team.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / TEAMS_PER_PAGE);

  return {
    teams,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      perPage: TEAMS_PER_PAGE,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Count teams with filters
 * Used for pagination
 */
export async function countTeams(options: {
  search?: string;
  divisionId?: number;
  regionId?: number;
  status?: TeamStatus;
  seasonId?: number;
}) {
  const { search, divisionId, regionId, status, seasonId } = options;

  const where: Prisma.TeamWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { acronym: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (divisionId) where.divisionId = divisionId;
  if (regionId) where.regionId = regionId;
  if (status) where.status = status;
  if (seasonId) where.seasonId = seasonId;

  return await prisma.team.count({ where });
}

/**
 * Get teams for standings/league view
 * Returns teams with calculated stats
 */
export async function getTeamsForStandings(options: {
  seasonId?: number;
  regionId?: number;
  divisionId?: number;
  statuses?: TeamStatus[];
  limit?: number;
}) {
  const { seasonId, regionId, divisionId, statuses, limit } = options;

  const where: Prisma.TeamWhereInput = {};

  if (seasonId) where.seasonId = seasonId;
  if (regionId) where.regionId = regionId;
  if (divisionId) where.divisionId = divisionId;
  if (statuses && statuses.length > 0) {
    where.status = { in: statuses };
  }

  const teams = await prisma.team.findMany({
    where,
    select: {
      id: true,
      name: true,
      acronym: true,
      avatar: true,
      wins: true,
      losses: true,
      pointsScored: true,
      pointsScoredAgainst: true,
      gamesWon: true,
      gamesLost: true,
      paymentStatus: true,
      division: {
        select: {
          id: true,
          name: true,
        },
      },
      region: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { pointsScored: 'desc' }],
    take: limit,
  });

  return teams;
}

/**
 * Get teams by division for league standings
 * Returns teams with calculated average points
 */
export async function getTeamsByDivision(
  divisionId: number,
  seasonId: number,
  regionId: number,
  statuses: string[],
) {
  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      regionId,
      divisionId,
      status: { in: statuses as any },
    },
    select: {
      id: true,
      name: true,
      acronym: true,
      avatar: true,
      status: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
      pointsScoredAgainst: true,
      paymentStatus: true,
      players: {
        select: {
          playerSteamId: true,
          player: {
            select: {
              steamId: true,
              steamUsername: true,
            },
          },
        },
      },
    },
  });

  // Calculate derived stats and sort by average points
  return teams
    .map((team) => {
      const totalGames = team.gamesWon + team.gamesLost;
      const avgPoints = totalGames > 0 ? team.pointsScored / totalGames : 0;

      return {
        id: team.id,
        name: team.name,
        acronym: team.acronym,
        avatar: team.avatar,
        status: team.status,
        wins: team.wins,
        losses: team.losses,
        points: parseFloat(avgPoints.toFixed(1)),
        paymentStatus: team.paymentStatus,
        players: team.players,
        _sortKey: avgPoints, // temporary field for sorting
      };
    })
    .sort((a, b) => {
      // Sort by avg points DESC, then wins DESC, then losses ASC
      if (b._sortKey !== a._sortKey) return b._sortKey - a._sortKey;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.losses - b.losses;
    })
    .map(({ _sortKey, ...team }) => team); // Remove temporary sort key
}

/**
 * Get a single team by ID
 */
export async function getTeamById(id: number) {
  return await prisma.team.findUnique({
    where: { id },
    include: {
      division: true,
      region: true,
      season: true,
      players: {
        include: {
          player: {
            select: {
              steamId: true,
              steamUsername: true,
              steamAvatar: true,
            },
          },
        },
        orderBy: {
          startedAt: 'asc',
        },
      },
      homeMatches: {
        include: {
          awayTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: 'desc',
        },
      },
      awayMatches: {
        include: {
          homeTeam: {
            select: {
              id: true,
              name: true,
              acronym: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonNum: true,
            },
          },
        },
        orderBy: {
          matchDateTime: 'desc',
        },
      },
      _count: {
        select: {
          players: true,
          homeMatches: true,
          awayMatches: true,
        },
      },
    },
  });
}

/**
 * Update an existing team
 *
 * Business logic validation:
 * - Team must exist
 */
export async function updateTeam(
  id: number,
  data: {
    name: string;
    acronym?: string | null;
    seasonId?: number | null;
    divisionId?: number | null;
    regionId?: number | null;
    status?: TeamStatus;
  },
) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Team name is required');
  }

  // Check if team exists
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) {
    throw new Error('Team not found');
  }

  return await prisma.team.update({
    where: { id },
    data: {
      name: trimmedName,
      acronym: data.acronym?.trim() || null,
      seasonId: data.seasonId,
      divisionId: data.divisionId,
      regionId: data.regionId,
      status: data.status,
    },
  });
}

/**
 * Update team status
 */
export async function updateTeamStatus(id: number, status: TeamStatus) {
  const team = await prisma.team.findUnique({ where: { id } });

  if (!team) {
    throw new Error('Team not found');
  }

  return await prisma.team.update({
    where: { id },
    data: { status },
  });
}

/**
 * Find the most recent season that has teams with specific statuses
 * Used to find default season for league pages
 */
export async function findRecentSeasonWithTeams(
  statuses: string[],
  formatId?: number,
) {
  return await prisma.team.findFirst({
    where: {
      status: { in: statuses as any },
      ...(formatId !== undefined && { formatId }),
    },
    orderBy: {
      seasonId: 'desc',
    },
    select: {
      seasonId: true,
      regionId: true,
    },
  });
}

/**
 * Get top 1v1 entries for the homepage card
 * Includes player steamId for profile links
 */
export async function getTop1v1EntriesForHomepage(options: {
  seasonId: number;
  divisionId: number;
  limit?: number;
}) {
  const { seasonId, divisionId, limit = 3 } = options;

  const teams = await prisma.team.findMany({
    where: {
      seasonId,
      divisionId,
      status: 'READY',
    },
    select: {
      id: true,
      name: true,
      avatar: true,
      wins: true,
      losses: true,
      gamesWon: true,
      gamesLost: true,
      pointsScored: true,
      players: {
        select: {
          player: {
            select: {
              steamId: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }, { pointsScored: 'desc' }],
    take: limit,
  });

  return teams.map((team, index) => {
    const totalGames = team.gamesWon + team.gamesLost;
    const pointsPerGame =
      totalGames > 0
        ? parseFloat((team.pointsScored / totalGames).toFixed(1))
        : 0;
    return {
      rank: index + 1,
      id: team.id,
      name: team.name,
      avatar: team.avatar,
      steamId: team.players[0]?.player?.steamId ?? null,
      wins: team.wins,
      losses: team.losses,
      record: `${team.wins}-${team.losses}`,
      pointsPerGame,
    };
  });
}

/**
 * Helper: Calculate standings stats for a team
 */
export function calculateStandingsStats(team: {
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsScored: number;
  pointsScoredAgainst: number;
}) {
  const totalGames = team.gamesWon + team.gamesLost;
  const ppg =
    totalGames > 0 ? (team.pointsScored / totalGames).toFixed(1) : '0.0';
  const winRate =
    team.wins + team.losses > 0
      ? ((team.wins / (team.wins + team.losses)) * 100).toFixed(1)
      : '0.0';

  return {
    pointsPerGame: parseFloat(ppg),
    winRate: parseFloat(winRate),
    record: `${team.wins}-${team.losses}`,
  };
}
