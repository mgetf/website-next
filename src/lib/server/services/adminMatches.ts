/**
 * Admin Match Management Service
 * Match creation, bulk operations, and admin-only functions
 */

import { prisma } from '$lib/server/db';
import type { Team } from '$prisma/client.js';
import { MatchStatus, TeamStatus } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import {
  calculateWinLossRatio,
  calculatePointsPerGame,
  localDatetimeToUtc,
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
    const ppgA = calculatePointsPerGame(a.pointsScored, a.gamesWon, a.gamesLost);
    const ppgB = calculatePointsPerGame(b.pointsScored, b.gamesWon, b.gamesLost);
    return ppgB - ppgA;
  });
}

/**
 * Pair teams for matches, avoiding repeat matchups
 * Returns array of teams paired in order [team1, team2, team3, team4, ...]
 */
export async function pairTeamsForMatches(teams: Team[], seasonId: number): Promise<Team[]> {
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
          console.log(`Team ${currentTeam.name} has played everyone multiple times`);
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
  matchTimezone?: string;
  mapBanPoolId?: number;
  // Playoff-specific parameters
  isPlayoff?: boolean;
  playoffId?: number;
  playoffRound?: number;
  boGames?: number;
  // Optional admin-specified pairings (skips auto-pairing algorithm when provided)
  manualPairings?: { homeTeamId: number; awayTeamId: number }[];
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
    matchTimezone,
    mapBanPoolId,
    isPlayoff,
    playoffId,
    playoffRound,
    boGames,
    manualPairings,
  } = params;

  // For playoff matches, use the dedicated playoff match creation function
  if (isPlayoff) {
    if (!playoffId || !playoffRound) {
      badRequest('Playoff ID and round are required for playoff matches');
    }

    // Note: This is a simplified implementation
    // In a real playoff system, you'd need to provide team pairings
    // For now, we'll throw an error directing to use the dedicated playoff function
    badRequest('Playoff matches require manual team selection. Use createPlayoffMatch instead.');
  }

  // Get season settings for payment requirement and format (per-season setting)
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { paymentRequired: true, formatId: true },
  });
  const paymentRequired = season?.paymentRequired ?? false;

  // Build conditions for team selection
  const conditions: any = {
    regionId,
    divisionId,
    seasonId,
    formatId: season?.formatId,
    status: TeamStatus.READY,
  };

  if (paymentRequired) {
    conditions.paymentStatus = { in: [1, 2] }; // PAID or EXEMPT
  }

  // Get eligible teams
  const teams = await prisma.team.findMany({
    where: conditions,
  });

  if (teams.length < 2) {
    badRequest('Not enough eligible teams for match creation');
  }

  const seasonFormatId = season?.formatId;
  const eligibleTeamIds = new Set(teams.map((t) => t.id));

  let matchPairs: { homeTeam: Team; awayTeam: Team }[];

  if (manualPairings && manualPairings.length > 0) {
    // Validate each pairing against eligible teams
    for (const { homeTeamId, awayTeamId } of manualPairings) {
      if (!eligibleTeamIds.has(homeTeamId)) {
        badRequest(`Team ${homeTeamId} is not eligible for this match set`);
      }
      if (!eligibleTeamIds.has(awayTeamId)) {
        badRequest(`Team ${awayTeamId} is not eligible for this match set`);
      }
      if (homeTeamId === awayTeamId) {
        badRequest(`A team cannot play against itself (team ${homeTeamId})`);
      }
    }

    const teamsById = new Map(teams.map((t) => [t.id, t]));
    matchPairs = manualPairings.map(({ homeTeamId, awayTeamId }) => ({
      homeTeam: teamsById.get(homeTeamId)!,
      awayTeam: teamsById.get(awayTeamId)!,
    }));
  } else {
    // Auto-pair using standings-based algorithm
    const pairedTeams = await pairTeamsForMatches(teams, seasonId);

    if (pairedTeams.length === 0) {
      badRequest('No valid team pairings found');
    }

    matchPairs = [];
    for (let i = 0; i < pairedTeams.length - 1; i += 2) {
      matchPairs.push({ homeTeam: pairedTeams[i], awayTeam: pairedTeams[i + 1] });
    }
  }

  // Identify teams that were not paired — they receive a bye week
  const pairedTeamIds = new Set(matchPairs.flatMap((p) => [p.homeTeam.id, p.awayTeam.id]));
  const byeTeams = teams.filter((t) => !pairedTeamIds.has(t.id));

  // Create matches
  const matches = [];
  for (const { homeTeam, awayTeam } of matchPairs) {
    if (homeTeam.formatId !== seasonFormatId || awayTeam.formatId !== seasonFormatId) {
      badRequest(
        `Format mismatch: teams must match the season's format. ` +
          `Season formatId=${seasonFormatId}, home formatId=${homeTeam.formatId}, away formatId=${awayTeam.formatId}`,
      );
    }

    const match = await prisma.match.create({
      data: {
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        seasonId,
        seasonNo,
        weekNo,
        boSeries,
        matchDateTime: matchDateTime
          ? localDatetimeToUtc(matchDateTime, matchTimezone || 'UTC')
          : null,
        matchTimezone: matchTimezone || null,
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

  // Create bye week records and notify owners for unpaired teams
  for (const byeTeam of byeTeams) {
    if (weekNo !== undefined) {
      await prisma.byeWeek.create({
        data: { teamId: byeTeam.id, seasonId, seasonNo, weekNo },
      });

      await createNotificationForTeamOwners(
        [byeTeam.id],
        'BYE_WEEK',
        `/teams/${byeTeam.id}`,
        `Your team has a bye week for Week ${weekNo}. No match was scheduled this week.`,
      );
    }
  }

  return { matches, byeTeams };
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
  matchTimezone?: string;
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
    matchTimezone,
    mapBanPoolId,
  } = params;

  // Verify playoff exists
  const playoff = await prisma.playoff.findUnique({
    where: { id: playoffId },
  });

  if (!playoff) {
    notFound('Playoff not found');
  }

  // Validate that both teams match the season's format
  const [seasonData, homeTeam, awayTeam] = await Promise.all([
    prisma.season.findUnique({ where: { id: seasonId }, select: { formatId: true } }),
    prisma.team.findUnique({ where: { id: homeTeamId }, select: { formatId: true, name: true } }),
    prisma.team.findUnique({ where: { id: awayTeamId }, select: { formatId: true, name: true } }),
  ]);

  if (!homeTeam) notFound(`Home team ${homeTeamId} not found`);
  if (!awayTeam) notFound(`Away team ${awayTeamId} not found`);

  const seasonFormatId = seasonData?.formatId;
  if (homeTeam.formatId !== seasonFormatId) {
    badRequest(
      `Format mismatch: home team "${homeTeam.name}" (formatId=${homeTeam.formatId}) does not match season format (formatId=${seasonFormatId})`,
    );
  }
  if (awayTeam.formatId !== seasonFormatId) {
    badRequest(
      `Format mismatch: away team "${awayTeam.name}" (formatId=${awayTeam.formatId}) does not match season format (formatId=${seasonFormatId})`,
    );
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
      matchDateTime: matchDateTime
        ? localDatetimeToUtc(matchDateTime, matchTimezone || 'UTC')
        : null,
      matchTimezone: matchTimezone || null,
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
  const roundLabel =
    playoffRound > 0 ? `Round ${playoffRound}` : `Lower Round ${Math.abs(playoffRound)}`;
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
export async function getEligibleTeams(regionId: number, divisionId: number, seasonId: number) {
  // Get season settings for payment requirement and format (per-season setting)
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { paymentRequired: true, formatId: true },
  });
  const paymentRequired = season?.paymentRequired ?? false;

  const conditions: any = {
    regionId,
    divisionId,
    seasonId,
    formatId: season?.formatId,
    status: TeamStatus.READY,
  };

  if (paymentRequired) {
    conditions.paymentStatus = { in: [1, 2] }; // PAID or EXEMPT
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

interface GameResult {
  gameNum: number;
  homeScore: number;
  awayScore: number;
}

const ALLOWED_BO_SERIES = new Set([1, 3, 5, 7]);

/**
 * Admin override scores (reverses old stats and applies new ones).
 * Optionally changes Best of series (`boSeries`), creating or removing `Game` rows as needed.
 */
export async function adminUpdateScores(
  matchId: number,
  gameResults: GameResult[],
  options: { resolveDispute?: boolean; boSeries?: number } = {},
) {
  return await prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        games: { orderBy: { gameNum: 'asc' } },
      },
    });

    if (!match) {
      notFound('Match not found');
    }

    const targetBo =
      options.boSeries !== undefined && options.boSeries !== null
        ? options.boSeries
        : (match.boSeries ?? 3);

    if (!ALLOWED_BO_SERIES.has(targetBo)) {
      badRequest('Best of series must be 1, 3, 5, or 7');
    }

    for (const r of gameResults) {
      if (r.gameNum < 1 || r.gameNum > targetBo) {
        badRequest(`Invalid game number ${r.gameNum} for Best of ${targetBo}`);
      }
    }

    // If match was already played, reverse old stats
    if (match.winnerId) {
      const previousHomeWins = match.games.filter(
        (g) =>
          g.homeTeamScore != null && g.awayTeamScore != null && g.homeTeamScore > g.awayTeamScore,
      ).length;
      const previousAwayWins = match.games.filter(
        (g) =>
          g.homeTeamScore != null && g.awayTeamScore != null && g.awayTeamScore > g.homeTeamScore,
      ).length;
      const previousHomePoints = match.games.reduce((sum, g) => sum + (g.homeTeamScore || 0), 0);
      const previousAwayPoints = match.games.reduce((sum, g) => sum + (g.awayTeamScore || 0), 0);

      await tx.team.update({
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

      await tx.team.update({
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

    const toRemove = match.games.filter((g) => g.gameNum > targetBo);
    for (const g of toRemove) {
      if (g.homeTeamScore != null || g.awayTeamScore != null) {
        badRequest(
          `Cannot reduce Best of to ${targetBo}: game ${g.gameNum} has scores. Remove those scores or choose a higher Best of.`,
        );
      }
    }
    if (toRemove.length > 0) {
      await tx.game.deleteMany({
        where: { matchId, gameNum: { gt: targetBo } },
      });
    }

    const defaultArenaId = match.games.find((g) => g.gameNum === 1)?.arenaId ?? null;
    const existingNums = new Set(
      (
        await tx.game.findMany({
          where: { matchId },
          select: { gameNum: true },
        })
      ).map((g) => g.gameNum),
    );
    for (let n = 1; n <= targetBo; n++) {
      if (!existingNums.has(n)) {
        await tx.game.create({
          data: { matchId, gameNum: n, arenaId: defaultArenaId },
        });
      }
    }

    for (const result of gameResults) {
      await tx.game.updateMany({
        where: { matchId, gameNum: result.gameNum },
        data: {
          homeTeamScore: result.homeScore,
          awayTeamScore: result.awayScore,
        },
      });
    }

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

    await tx.team.update({
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

    await tx.team.update({
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

    const previousStatus = match.status;
    const nextStatus =
      previousStatus === MatchStatus.DISPUTE && !options.resolveDispute
        ? MatchStatus.DISPUTE
        : MatchStatus.PLAYED;

    return await tx.match.update({
      where: { id: matchId },
      data: {
        winnerId,
        winnerScore,
        loserScore,
        status: nextStatus,
        boSeries: targetBo,
      },
    });
  });
}

/**
 * Get available week and playoff round options for a season
 * Returns default weeks 1-8 when no matches exist yet
 */
export async function getWeekOptionsForSeason(
  seasonId: number | null,
): Promise<{ value: string; label: string }[]> {
  if (!seasonId) return [];

  const [weekMatches, playoffMatches] = await Promise.all([
    prisma.match.findMany({
      where: { seasonId, weekNo: { not: null } },
      select: { weekNo: true },
      distinct: ['weekNo'],
      orderBy: { weekNo: 'asc' },
    }),
    prisma.match.findMany({
      where: { seasonId, playoffRound: { not: null } },
      select: { playoffRound: true },
      distinct: ['playoffRound'],
      orderBy: { playoffRound: 'asc' },
    }),
  ]);

  const options: { value: string; label: string }[] = [];

  for (const m of weekMatches) {
    if (m.weekNo !== null) {
      options.push({ value: m.weekNo.toString(), label: `Week ${m.weekNo}` });
    }
  }

  for (const m of playoffMatches) {
    if (m.playoffRound !== null) {
      options.push({
        value: `p${m.playoffRound}`,
        label: `Playoffs Match ${m.playoffRound}`,
      });
    }
  }

  if (options.length === 0) {
    for (let i = 1; i <= 8; i++) {
      options.push({ value: i.toString(), label: `Week ${i}` });
    }
  }

  return options;
}

/**
 * Get matches for the admin week/playoff view with full relations
 */
export async function getMatchesForAdminWeekView(options: {
  seasonId: number;
  weekNo?: number | null;
  playoffRound?: number | null;
}) {
  const { seasonId, weekNo, playoffRound } = options;

  const where: any = { seasonId };

  if (playoffRound !== undefined && playoffRound !== null) {
    where.playoffRound = playoffRound;
    where.weekNo = null;
  } else if (weekNo !== undefined && weekNo !== null) {
    where.weekNo = weekNo;
    where.playoffId = null;
  }

  return await prisma.match.findMany({
    where,
    include: {
      homeTeam: { include: { division: true, region: true } },
      awayTeam: { include: { division: true, region: true } },
      season: { include: { region: true } },
      playoff: true,
      games: {
        include: { arena: true },
        orderBy: { gameNum: 'asc' },
      },
    },
    orderBy: [{ id: 'asc' }],
  });
}

/**
 * Admin: update a match's scheduled date/time and source timezone.
 * matchDateTimeUtc must be a valid UTC ISO 8601 string (or null to clear).
 * Both fields are updated atomically.
 */
export async function adminUpdateMatchSchedule(
  matchId: number,
  matchDateTimeUtc: string | null,
  matchTimezone: string | null,
) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!match) notFound('Match not found');

  return await prisma.match.update({
    where: { id: matchId },
    data: {
      matchDateTime: matchDateTimeUtc ? new Date(matchDateTimeUtc) : null,
      matchTimezone: matchTimezone || null,
    },
  });
}

/**
 * Admin: update per-game arena assignments for a match.
 * Each entry maps a gameId to an arenaId (null clears the assignment).
 */
export async function adminUpdateMatchArenas(
  matchId: number,
  arenaAssignments: { gameId: number; arenaId: number | null }[],
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, games: { select: { id: true } } },
  });
  if (!match) notFound('Match not found');

  const validGameIds = new Set(match.games.map((g) => g.id));

  for (const { gameId, arenaId } of arenaAssignments) {
    if (!validGameIds.has(gameId)) {
      badRequest(`Game ${gameId} does not belong to match ${matchId}`);
    }
    await prisma.game.update({
      where: { id: gameId },
      data: { arenaId: arenaId ?? null },
    });
  }
}

/**
 * Admin: delete an unplayed match with no submitted game results.
 * Cascades related records in dependency order.
 * Throws if the match is already played/disputed or has recorded scores.
 */
export async function adminDeleteMatch(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      status: true,
      games: { select: { id: true, homeTeamScore: true, awayTeamScore: true } },
    },
  });

  if (!match) notFound('Match not found');

  if (match.status !== MatchStatus.UNPLAYED) {
    badRequest('Only unplayed matches can be deleted');
  }

  const hasScores = match.games.some((g) => g.homeTeamScore !== null || g.awayTeamScore !== null);
  if (hasScores) {
    badRequest('Cannot delete a match that already has recorded scores');
  }

  await prisma.$transaction([
    prisma.matchMapBan.deleteMany({ where: { matchId } }),
    prisma.matchComm.deleteMany({ where: { matchId } }),
    prisma.game.deleteMany({ where: { matchId } }),
    prisma.match.delete({ where: { id: matchId } }),
  ]);
}

/**
 * Get matches for a set of team IDs, for the admin teams page match history column
 */
export async function getMatchesByTeamIds(teamIds: number[]) {
  if (teamIds.length === 0) return [];

  return await prisma.match.findMany({
    where: {
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
      weekNo: true,
      status: true,
      winnerScore: true,
      loserScore: true,
      matchDateTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { weekNo: 'asc' },
  });
}
