/**
 * Admin Match Management Service
 * Match creation, bulk operations, and admin-only functions
 */

import { prisma } from '$lib/server/db';
import type { Team } from '$prisma/client.js';
import { MatchStatus, TeamStatus } from '$prisma/client.js';
import { error } from '@sveltejs/kit';
import {
  calculateWinLossRatio,
  calculatePointsPerGame,
} from '$lib/server/utils/matchHelpers';
import { createNotificationForTeamOwners } from './notifications';

/**
 * Sort teams by standings
 * Priority: wins → win/loss ratio → points per game
 */
export function sortTeamsByStandings(teams: Team[]): Team[] {
  return teams.sort((a, b) => {
    // Primary: wins
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }

    // Secondary: win/loss ratio
    const ratioA = calculateWinLossRatio(a.wins, a.losses);
    const ratioB = calculateWinLossRatio(b.wins, b.losses);
    if (ratioA !== ratioB) {
      return ratioB - ratioA;
    }

    // Tertiary: points per game
    const ppgA = calculatePointsPerGame(
      a.pointsScored,
      a.gamesWon,
      a.gamesLost,
    );
    const ppgB = calculatePointsPerGame(
      b.pointsScored,
      b.gamesWon,
      b.gamesLost,
    );
    return ppgB - ppgA;
  });
}

/**
 * Pair teams for matches, avoiding repeat matchups
 * Returns array of teams paired in order [team1, team2, team3, team4, ...]
 */
export async function pairTeamsForMatches(
  teams: Team[],
  seasonId: number,
): Promise<Team[]> {
  const sortedTeams = sortTeamsByStandings(teams);
  const finalTeams: Team[] = [];

  console.log(`\n=== Pairing ${sortedTeams.length} teams for matches ===`);

  for (let i = 0; i < sortedTeams.length; i++) {
    const currentTeam = sortedTeams[i];

    if (finalTeams.some((team) => team.id === currentTeam.id)) {
      continue;
    }

    let x = 1;
    let playedAll = 0;
    let foundMatch = false;

    while (!foundMatch) {
      if (i + x >= sortedTeams.length) {
        x = 1;
        playedAll++;

        if (playedAll > 100) {
          console.log(
            `Team ${currentTeam.name} has played everyone multiple times`,
          );
          break;
        }
        continue;
      }

      const potentialOpponent = sortedTeams[i + x];

      if (finalTeams.some((team) => team.id === potentialOpponent.id)) {
        x++;
        continue;
      }

      // Check existing matches between these teams
      const existingMatches = await prisma.match.findMany({
        where: {
          seasonId,
          OR: [
            {
              homeTeamId: currentTeam.id,
              awayTeamId: potentialOpponent.id,
            },
            {
              homeTeamId: potentialOpponent.id,
              awayTeamId: currentTeam.id,
            },
          ],
        },
      });

      if (existingMatches.length <= playedAll) {
        finalTeams.push(currentTeam);
        finalTeams.push(potentialOpponent);
        foundMatch = true;
      }

      x++;
    }
  }

  console.log(`\n=== Paired ${finalTeams.length / 2} matches ===`);
  return finalTeams;
}

interface CreateMatchSetParams {
  seasonId: number;
  seasonNo: number;
  weekNo?: number;
  boSeries: number;
  arenaId?: number;
  matchDateTime?: string;
  mapBanPoolId?: number;
  // Playoff-specific parameters
  isPlayoff?: boolean;
  playoffId?: number;
  playoffRound?: number;
  boGames?: number;
}

/**
 * Create a set of regular season matches
 */
export async function createMatchSet(
  regionId: number,
  divisionId: number,
  params: CreateMatchSetParams,
) {
  const {
    seasonId,
    seasonNo,
    weekNo,
    boSeries,
    arenaId,
    matchDateTime,
    mapBanPoolId,
    isPlayoff,
    playoffId,
    playoffRound,
    boGames,
  } = params;

  // For playoff matches, use the dedicated playoff match creation function
  if (isPlayoff) {
    if (!playoffId || !playoffRound) {
      throw error(400, 'Playoff ID and round are required for playoff matches');
    }

    // Note: This is a simplified implementation
    // In a real playoff system, you'd need to provide team pairings
    // For now, we'll throw an error directing to use the dedicated playoff function
    throw error(
      400,
      'Playoff matches require manual team selection. Use createPlayoffMatch instead.',
    );
  }

  // Get season settings for payment requirement (per-season setting)
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { paymentRequired: true },
  });
  const paymentRequired = season?.paymentRequired ?? false;

  // Build conditions for team selection
  const conditions: any = {
    regionId,
    divisionId,
    seasonId,
    status: TeamStatus.READY,
  };

  if (paymentRequired) {
    conditions.paymentStatus = 1; // PAID
  }

  // Get eligible teams
  const teams = await prisma.team.findMany({
    where: conditions,
  });

  if (teams.length < 2) {
    throw error(400, 'Not enough eligible teams for match creation');
  }

  // Pair teams
  const pairedTeams = await pairTeamsForMatches(teams, seasonId);

  if (pairedTeams.length === 0) {
    throw error(400, 'No valid team pairings found');
  }

  // Create matches
  const matches = [];
  for (let i = 0; i < pairedTeams.length - 1; i += 2) {
    const homeTeam = pairedTeams[i];
    const awayTeam = pairedTeams[i + 1];

    const match = await prisma.match.create({
      data: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        seasonId,
        seasonNo,
        weekNo,
        boSeries,
        matchDateTime: matchDateTime ? new Date(matchDateTime + 'Z') : null,
        status: MatchStatus.UNPLAYED,
      },
    });

    // Create games for this match
    for (let gameNum = 1; gameNum <= boSeries; gameNum++) {
      await prisma.game.create({
        data: {
          matchId: match.id,
          gameNum,
          arenaId: arenaId || null,
        },
      });
    }

    // Create initial match comm with instructions
    await prisma.matchComm.create({
      data: {
        matchId: match.id,
        owner: '76561199005229176', // System user
        content: `Match Created! Important Information:

1. Contact: Please reach out to your opponent via Discord or Steam.
2. Demo Required: You must record a demo of your match.
3. Servers: Check #match-servers in Discord for official server information.
4. Rules: Review the rulebook at https://mge.tf/rulebook
5. Issue Resolution:
  - First, check the rulebook
  - Then, communicate with your opponent
  - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!`,
        createdAt: new Date(),
      },
    });

    // Initialize map ban phase if pool specified
    if (mapBanPoolId) {
      await prisma.matchMapBan.create({
        data: {
          matchId: match.id,
          poolId: mapBanPoolId,
          currentTurn: 0, // Starts with away team (will ban first)
          banPhaseComplete: false,
        },
      });
    }

    // Send notifications to team owners
    await createNotificationForTeamOwners(
      [homeTeam.id, awayTeam.id],
      'MATCH_CREATED',
      `/matches/${match.id}`,
      `New match scheduled for Week ${weekNo}`,
    );

    matches.push(match);
  }

  return matches;
}

interface CreatePlayoffMatchParams {
  seasonId: number;
  seasonNo: number;
  playoffId: number;
  playoffRound: number;
  homeTeamId: number;
  awayTeamId: number;
  boSeries: number;
  boGames?: number;
  arenaId?: number;
  matchDateTime?: string;
  mapBanPoolId?: number;
}

/**
 * Create a single playoff match
 */
export async function createPlayoffMatch(params: CreatePlayoffMatchParams) {
  const {
    seasonId,
    seasonNo,
    playoffId,
    playoffRound,
    homeTeamId,
    awayTeamId,
    boSeries,
    boGames,
    arenaId,
    matchDateTime,
    mapBanPoolId,
  } = params;

  // Verify playoff exists
  const playoff = await prisma.playoff.findUnique({
    where: { id: playoffId },
  });

  if (!playoff) {
    throw error(404, 'Playoff not found');
  }

  // Create match
  const match = await prisma.match.create({
    data: {
      homeTeamId,
      awayTeamId,
      seasonId,
      seasonNo,
      playoffId,
      playoffRound,
      weekNo: null,
      boSeries,
      boGames: boGames || null,
      matchDateTime: matchDateTime ? new Date(matchDateTime) : null,
      status: MatchStatus.UNPLAYED,
    },
  });

  // Create games (accounting for boGames if specified)
  const gamesPerArena = boGames || 1;
  const totalGames = boSeries * gamesPerArena;

  for (let gameNum = 1; gameNum <= totalGames; gameNum++) {
    await prisma.game.create({
      data: {
        matchId: match.id,
        gameNum,
        arenaId: arenaId || null,
      },
    });
  }

  // Create initial match comm
  await prisma.matchComm.create({
    data: {
      matchId: match.id,
      owner: '76561199005229176', // System user
      content: `Match Created! Important Information:

1. Contact: Please reach out to your opponent via Discord or Steam.
2. Demo Required: You must record a demo of your match.
3. Servers: Check #match-servers in Discord for official server information.
4. Rules: Review the rulebook at https://mge.tf/rulebook
5. Issue Resolution:
  - First, check the rulebook
  - Then, communicate with your opponent
  - Only contact an admin as a last resort

Need help? Ask in Discord or contact an admin.

Good luck to both teams!`,
      createdAt: new Date(),
    },
  });

  // Initialize map ban phase if pool specified
  if (mapBanPoolId) {
    await prisma.matchMapBan.create({
      data: {
        matchId: match.id,
        poolId: mapBanPoolId,
        currentTurn: 0,
        banPhaseComplete: false,
      },
    });
  }

  // Send notifications to team owners
  const roundLabel = playoffRound > 0 ? `Round ${playoffRound}` : `Lower Round ${Math.abs(playoffRound)}`;
  await createNotificationForTeamOwners(
    [homeTeamId, awayTeamId],
    'MATCH_CREATED',
    `/matches/${match.id}`,
    `New playoff match scheduled: ${roundLabel}`,
  );

  return match;
}

/**
 * Get teams eligible for match creation
 * Filters by region, division, season, and READY status.
 */
export async function getEligibleTeams(
  regionId: number,
  divisionId: number,
  seasonId: number,
) {
  // Get season settings for payment requirement (per-season setting)
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { paymentRequired: true },
  });
  const paymentRequired = season?.paymentRequired ?? false;

  const conditions: any = {
    regionId,
    divisionId,
    seasonId,
    status: TeamStatus.READY,
  };

  if (paymentRequired) {
    conditions.paymentStatus = 1;
  }

  return await prisma.team.findMany({
    where: conditions,
    include: {
      division: true,
      region: true,
    },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }],
  });
}

/**
 * Calculate the week label for a new match set
 * Returns the week number with suffix (e.g., "3b" if Week 3a already exists)
 */
export async function calculateWeekLabel(
  regionId: number,
  divisionId: number,
  seasonId: number,
  weekNo: number,
): Promise<{ weekLabel: string; existingCount: number }> {
  // Find all matches for this week/season where both teams are in the same region/division
  const existingMatches = await prisma.match.findMany({
    where: {
      weekNo,
      seasonId,
      homeTeam: {
        regionId,
        divisionId,
      },
      awayTeam: {
        regionId,
        divisionId,
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  console.log('Found existing matches:', existingMatches.length);

  // Group matches into sets by checking for gaps in IDs
  // Matches created together have sequential IDs
  let matchSetCount = 0;
  if (existingMatches.length > 0) {
    let lastId = existingMatches[0].id;
    matchSetCount = 1;

    for (let i = 1; i < existingMatches.length; i++) {
      if (existingMatches[i].id - lastId > 10) {
        // Gap detected, new match set
        matchSetCount++;
      }
      lastId = existingMatches[i].id;
    }
  }

  // Calculate suffix
  let weekLabel = weekNo.toString();
  if (matchSetCount > 0) {
    const suffixChar = String.fromCharCode('a'.charCodeAt(0) + matchSetCount);
    weekLabel = `${weekNo}${suffixChar}`;
  }

  console.log('Week label:', weekLabel, 'Match sets:', matchSetCount);

  return { weekLabel, existingCount: matchSetCount };
}

/**
 * Get matches with filters and pagination for admin page
 */
export async function getAdminMatches(options: {
  filters: {
    seasonId?: string | null;
    divisionId?: string | null;
    regionId?: string | null;
    status?: string | null;
    weekNo?: string | null;
    search?: string | null;
  };
  pagination: { page: number; limit: number };
}) {
  const { filters, pagination } = options;
  const { page, limit } = pagination;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  if (filters.seasonId) where.seasonId = parseInt(filters.seasonId);
  if (filters.status) {
    const statusNum = parseInt(filters.status);
    if (statusNum === 0) where.status = MatchStatus.UNPLAYED;
    else if (statusNum === 1) where.status = MatchStatus.PLAYED;
    else if (statusNum === 2) where.status = MatchStatus.DISPUTE;
  }
  if (filters.weekNo) where.weekNo = parseInt(filters.weekNo);

  // Team-based filters
  if (filters.divisionId || filters.regionId || filters.search) {
    const teamWhere: any = {};
    if (filters.divisionId) teamWhere.divisionId = parseInt(filters.divisionId);
    if (filters.regionId) teamWhere.regionId = parseInt(filters.regionId);
    if (filters.search) {
      teamWhere.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { acronym: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (Object.keys(teamWhere).length > 0) {
      where.OR = [{ homeTeam: teamWhere }, { awayTeam: teamWhere }];
    }
  }

  // Fetch matches
  const [matches, totalCount] = await Promise.all([
    prisma.match.findMany({
      where,
      include: {
        homeTeam: {
          include: { division: true, region: true },
        },
        awayTeam: {
          include: { division: true, region: true },
        },
        season: {
          include: { region: true },
        },
        playoff: true,
      },
      orderBy: [{ id: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.match.count({ where }),
  ]);

  return { matches, totalCount };
}

/**
 * Update match status (resolve disputes, force status changes)
 */
export async function updateMatchStatus(matchId: number, status: MatchStatus) {
  return await prisma.match.update({
    where: { id: matchId },
    data: { status },
  });
}

interface GameResult {
  gameNum: number;
  homeScore: number;
  awayScore: number;
}

/**
 * Get recent unplayed matches for dashboard quick view
 */
export async function getRecentUnplayedMatches(limit: number = 10) {
  return await prisma.match.findMany({
    where: {
      status: MatchStatus.UNPLAYED,
    },
    include: {
      homeTeam: {
        select: {
          id: true,
          name: true,
          acronym: true,
          division: { select: { id: true, name: true } },
          region: { select: { id: true, name: true } },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          acronym: true,
          division: { select: { id: true, name: true } },
          region: { select: { id: true, name: true } },
        },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
          region: { select: { name: true } },
        },
      },
    },
    orderBy: [{ id: 'desc' }],
    take: limit,
  });
}

/**
 * Admin override scores (reverses old stats and applies new ones)
 */
export async function adminUpdateScores(
  matchId: number,
  gameResults: GameResult[],
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      games: true,
    },
  });

  if (!match) {
    throw error(404, 'Match not found');
  }

  // If match was already played, reverse old stats
  if (match.winnerId) {
    const previousHomeWins = match.games.filter(
      (g) =>
        g.homeTeamScore && g.awayTeamScore && g.homeTeamScore > g.awayTeamScore,
    ).length;
    const previousAwayWins = match.games.filter(
      (g) =>
        g.homeTeamScore && g.awayTeamScore && g.awayTeamScore > g.homeTeamScore,
    ).length;
    const previousHomePoints = match.games.reduce(
      (sum, g) => sum + (g.homeTeamScore || 0),
      0,
    );
    const previousAwayPoints = match.games.reduce(
      (sum, g) => sum + (g.awayTeamScore || 0),
      0,
    );

    // Reverse home team stats
    await prisma.team.update({
      where: { id: match.homeTeamId },
      data: {
        wins: { decrement: match.winnerId === match.homeTeamId ? 1 : 0 },
        losses: { decrement: match.winnerId === match.awayTeamId ? 1 : 0 },
        gamesWon: { decrement: previousHomeWins },
        gamesLost: { decrement: previousAwayWins },
        pointsScored: { decrement: previousHomePoints },
        pointsScoredAgainst: { decrement: previousAwayPoints },
      },
    });

    // Reverse away team stats
    await prisma.team.update({
      where: { id: match.awayTeamId },
      data: {
        wins: { decrement: match.winnerId === match.awayTeamId ? 1 : 0 },
        losses: { decrement: match.winnerId === match.homeTeamId ? 1 : 0 },
        gamesWon: { decrement: previousAwayWins },
        gamesLost: { decrement: previousHomeWins },
        pointsScored: { decrement: previousAwayPoints },
        pointsScoredAgainst: { decrement: previousHomePoints },
      },
    });
  }

  // Update games with new scores
  for (const result of gameResults) {
    await prisma.game.updateMany({
      where: { matchId, gameNum: result.gameNum },
      data: {
        homeTeamScore: result.homeScore,
        awayTeamScore: result.awayScore,
      },
    });
  }

  // Calculate new winner
  const homeWins = gameResults.filter((g) => g.homeScore > g.awayScore).length;
  const awayWins = gameResults.filter((g) => g.awayScore > g.homeScore).length;
  const homePoints = gameResults.reduce((sum, g) => sum + g.homeScore, 0);
  const awayPoints = gameResults.reduce((sum, g) => sum + g.awayScore, 0);

  let winnerId: number | null = null;
  let winnerScore = 0;
  let loserScore = 0;

  if (homeWins > awayWins) {
    winnerId = match.homeTeamId;
    winnerScore = homeWins;
    loserScore = awayWins;
  } else if (awayWins > homeWins) {
    winnerId = match.awayTeamId;
    winnerScore = awayWins;
    loserScore = homeWins;
  }

  // Apply new team stats
  await prisma.team.update({
    where: { id: match.homeTeamId },
    data: {
      wins: { increment: winnerId === match.homeTeamId ? 1 : 0 },
      losses: { increment: winnerId === match.awayTeamId ? 1 : 0 },
      gamesWon: { increment: homeWins },
      gamesLost: { increment: awayWins },
      pointsScored: { increment: homePoints },
      pointsScoredAgainst: { increment: awayPoints },
    },
  });

  await prisma.team.update({
    where: { id: match.awayTeamId },
    data: {
      wins: { increment: winnerId === match.awayTeamId ? 1 : 0 },
      losses: { increment: winnerId === match.homeTeamId ? 1 : 0 },
      gamesWon: { increment: awayWins },
      gamesLost: { increment: homeWins },
      pointsScored: { increment: awayPoints },
      pointsScoredAgainst: { increment: homePoints },
    },
  });

  // Update match
  return await prisma.match.update({
    where: { id: matchId },
    data: {
      winnerId,
      winnerScore,
      loserScore,
      status: MatchStatus.PLAYED,
    },
  });
}
