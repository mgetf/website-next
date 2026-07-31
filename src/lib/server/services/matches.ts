/**
 * Match Management Service
 * Core business logic for league matches (2v2 and 1v1)
 */

import { prisma } from '$lib/server/db';
import type { Match, Game, Team } from '$prisma/client.js';
import { MatchStatus } from '$prisma/client.js';
import { UserRole, type SessionUser } from '$lib/types/user';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { calculateWeekLabel } from '$lib/server/utils/matchHelpers';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { createNotificationForTeamOwners, createNotificationForAdmins } from './notifications';

async function getMatchDetailsRama(matchId: number) {
  const { ramaClientOpts } = await import('$lib/server/rama/config');
  const { createMatchClient, getMatch, getMatchComms } = await import('$lib/server/rama/match');
  const { createUsersClient, getUser } = await import('$lib/server/rama/users');
  const { getTeamById } = await import('$lib/server/services/teams');
  const { getSeasonById } = await import('$lib/server/services/seasons');
  const { createMapPoolsClient, getArena } = await import('$lib/server/rama/mapPools');

  const opts = ramaClientOpts();
  const matchClient = createMatchClient(opts);
  const row = await getMatch(matchClient, String(matchId));
  if (!row) notFound('Match not found');

  const homeTeamId = Number(row.homeTeamId);
  const awayTeamId = Number(row.awayTeamId);
  const seasonId = Number(row.seasonId);
  const [homeTeam, awayTeam, season, commsMap] = await Promise.all([
    getTeamById(homeTeamId),
    getTeamById(awayTeamId),
    getSeasonById(seasonId),
    getMatchComms(matchClient, String(matchId)),
  ]);
  if (!homeTeam || !awayTeam) notFound('Match teams not found');

  const boGames = Number(row.boGames ?? 1) || 1;
  const arenaIdRaw = row.arenaId ? String(row.arenaId) : '';
  const arenaId = arenaIdRaw ? Number(arenaIdRaw) : null;
  let arena: {
    id: number;
    name: string;
    avatar: string | null;
    playoffMap: number;
  } | null = null;
  if (arenaId != null && Number.isFinite(arenaId)) {
    const arenaRow = await getArena(createMapPoolsClient(opts), String(arenaId));
    if (arenaRow) {
      arena = {
        id: arenaId,
        name: arenaRow.name,
        avatar: arenaRow.avatar || null,
        playoffMap: Number(arenaRow.playoffMap ?? 0),
      };
    }
  }

  const status = String(row.status ?? 'UNPLAYED') as MatchStatus;
  const played = status === MatchStatus.PLAYED || status === MatchStatus.DISPUTE;
  const homeScore = played ? Number(row.homeScore ?? 0) : null;
  const awayScore = played ? Number(row.awayScore ?? 0) : null;

  const games = Array.from({ length: boGames }, (_, i) => ({
    id: matchId * 100 + i + 1,
    matchId,
    gameNum: i + 1,
    arenaId,
    homeTeamScore: i === 0 ? homeScore : null,
    awayTeamScore: i === 0 ? awayScore : null,
    arena,
  }));

  const matchDateTime =
    row.matchDateTime && String(row.matchDateTime).length > 0
      ? new Date(String(row.matchDateTime))
      : null;

  const homeActive = homeTeam.players.filter((p) => p.active === 1);
  const awayActive = awayTeam.players.filter((p) => p.active === 1);

  if (!season) notFound('Match season not found');

  const winnerIdRaw = row.winnerId ? Number(row.winnerId) : null;
  const winnerId =
    winnerIdRaw != null && Number.isFinite(winnerIdRaw) && winnerIdRaw > 0 ? winnerIdRaw : null;
  const winnerScore =
    played && winnerId != null ? (winnerId === homeTeamId ? homeScore : awayScore) : null;
  const loserScore =
    played && winnerId != null ? (winnerId === homeTeamId ? awayScore : homeScore) : null;

  const submittedByRaw = row.submittedBy ? String(row.submittedBy) : '';
  const submittedAtRaw = row.submittedAt ? String(row.submittedAt) : '';
  const submittedBy = submittedByRaw.length > 0 ? submittedByRaw : null;
  const submittedAt =
    submittedAtRaw.length > 0 && !Number.isNaN(new Date(submittedAtRaw).getTime())
      ? new Date(submittedAtRaw)
      : null;

  const usersClient = createUsersClient(opts);
  const matchComms = [];
  for (const [commId, comm] of Object.entries(commsMap)) {
    const user = comm.owner ? await getUser(usersClient, comm.owner) : null;
    const numericId = Number.parseInt(commId, 10);
    matchComms.push({
      id: Number.isFinite(numericId) ? numericId : Date.now(),
      matchId,
      owner: comm.owner || null,
      content: comm.content,
      createdAt: comm.createdAt ? new Date(comm.createdAt) : new Date(),
      reschedule: comm.reschedule || null,
      rescheduleStatus:
        comm.rescheduleStatus == null || Number(comm.rescheduleStatus) < 0
          ? null
          : Number(comm.rescheduleStatus),
      user: user
        ? {
            steamId: comm.owner,
            steamUsername: String(user.username ?? comm.owner),
            steamAvatar: String(user.avatarUrl ?? ''),
          }
        : null,
    });
  }
  matchComms.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let submitter = null;
  if (submittedBy) {
    const submitterUser = await getUser(usersClient, submittedBy);
    submitter = submitterUser
      ? {
          steamId: submittedBy,
          steamUsername: String(submitterUser.username ?? submittedBy),
          steamAvatar: String(submitterUser.avatarUrl ?? ''),
        }
      : { steamId: submittedBy, steamUsername: submittedBy, steamAvatar: '' };
  }

  const match = {
    id: matchId,
    homeTeamId,
    awayTeamId,
    seasonId,
    seasonNo: Number(row.seasonNo ?? season.seasonNum ?? 0),
    weekNo: Number(row.weekNo ?? 0) || null,
    playoffId: null as number | null,
    playoffRound: null as number | null,
    boSeries: boGames,
    boGames: null as number | null,
    status,
    matchDateTime,
    matchTimezone: row.matchTimezone ? String(row.matchTimezone) : null,
    homeTeamScore: homeScore,
    awayTeamScore: awayScore,
    winnerScore,
    loserScore,
    submittedBy,
    submittedAt,
    winnerId,
    homeTeam: { ...homeTeam, players: homeActive },
    awayTeam: { ...awayTeam, players: awayActive },
    season: {
      ...season,
      region: season.region ?? {
        id: season.regionId,
        name: String(season.regionId),
        hidden: 0,
        currencySymbol: '',
        currencyCode: '',
      },
    },
    playoff: null,
    games,
    matchComms,
    matchMapBans: [] as never[],
    demos: [] as never[],
    submitter,
  };

  const is1v1 = homeTeam.formatId === FORMAT_1V1;
  if (is1v1) {
    return {
      ...match,
      is1v1: true as const,
      homePlayer: homeActive[0]?.player || null,
      awayPlayer: awayActive[0]?.player || null,
    };
  }

  return {
    ...match,
    is1v1: false as const,
    homePlayer: null,
    awayPlayer: null,
  };
}

/**
 * Get complete match details with all relations
 */
export async function getMatchDetails(matchId: number) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    return (await getMatchDetailsRama(matchId)) as unknown as Awaited<
      ReturnType<typeof getMatchDetailsFromPrisma>
    >;
  }

  return getMatchDetailsFromPrisma(matchId);
}

async function getMatchDetailsFromPrisma(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: {
        include: {
          division: true,
          region: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      awayTeam: {
        include: {
          division: true,
          region: true,
          players: {
            where: { active: 1 },
            include: {
              player: true,
            },
          },
        },
      },
      season: {
        include: {
          region: true,
        },
      },
      playoff: true,
      games: {
        include: {
          arena: true,
        },
        orderBy: { gameNum: 'asc' },
      },
      matchComms: {
        include: {
          user: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      matchMapBans: {
        include: {
          pool: {
            include: {
              mapsInPool: {
                include: {
                  arena: true,
                },
                orderBy: { orderNum: 'asc' },
              },
            },
          },
          actions: {
            include: {
              team: true,
              player: true,
              arena: true,
            },
            orderBy: { actionOrder: 'asc' },
          },
        },
      },
      demos: {
        include: {
          player: true,
          submitter: true,
        },
        orderBy: { submittedAt: 'desc' },
      },
      submitter: true,
    },
  });

  if (!match) {
    notFound('Match not found');
  }

  // Check if this is a 1v1 match and add player info
  const is1v1 = match.homeTeam.formatId === FORMAT_1V1;

  if (is1v1) {
    // Get the active player from each "team" (there should only be one)
    const homePlayer = match.homeTeam.players[0]?.player || null;
    const awayPlayer = match.awayTeam.players[0]?.player || null;

    return {
      ...match,
      is1v1: true,
      homePlayer,
      awayPlayer,
    };
  }

  return {
    ...match,
    is1v1: false,
    homePlayer: null,
    awayPlayer: null,
  };
}

/**
 * Calculate week label for a match by finding all matches for the HOME team in that week
 * Returns the label (e.g., "1", "1a", "1b") or null if no week number
 * Note: Label is calculated from home team's perspective for consistency
 */
export async function getMatchWeekLabel(match: Match): Promise<string | null> {
  if (match.weekNo === null || match.weekNo === undefined) {
    return null;
  }

  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatchIdsForTeam, getMatchIdsForWeek } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const weekIds = await getMatchIdsForWeek(client, String(match.seasonId), match.weekNo);
    const teamIds = new Set(await getMatchIdsForTeam(client, String(match.homeTeamId)));
    const homeTeamMatchesForThisWeek = weekIds
      .filter((id) => teamIds.has(id))
      .map((id) => ({ id: Number(id) }))
      .sort((a, b) => a.id - b.id);
    return calculateWeekLabel(match, homeTeamMatchesForThisWeek);
  }

  // Get all matches for the HOME team in this week
  // This ensures consistent labeling from one team's perspective
  const homeTeamMatchesForThisWeek = await prisma.match.findMany({
    where: {
      seasonId: match.seasonId,
      weekNo: match.weekNo,
      playoffId: null,
      OR: [{ homeTeamId: match.homeTeamId }, { awayTeamId: match.homeTeamId }],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  return calculateWeekLabel(match, homeTeamMatchesForThisWeek);
}

/**
 * Calculate week labels for multiple matches
 * More efficient than calling getMatchWeekLabel multiple times
 */
export async function getMatchWeekLabels(matches: Match[]): Promise<Map<number, string | null>> {
  const labels = new Map<number, string | null>();

  for (const match of matches) {
    const label = await getMatchWeekLabel(match);
    labels.set(match.id, label);
  }

  return labels;
}

/**
 * Check if user can manage match (submit scores, dispute, etc.)
 * Team owners (permission=2) or admins/mods can manage
 */
export function canUserManageMatch(
  user: SessionUser | null,
  match: Match & {
    homeTeam: {
      formatId: number;
      players: Array<{
        playerSteamId: string;
        permissionLevel: number;
        active: number;
      }>;
    };
    awayTeam: {
      formatId: number;
      players: Array<{
        playerSteamId: string;
        permissionLevel: number;
        active: number;
      }>;
    };
  },
): {
  canManage: boolean;
  isHomeOwner: boolean;
  isAwayOwner: boolean;
  isAdmin: boolean;
} {
  if (!user) {
    return {
      canManage: false,
      isHomeOwner: false,
      isAwayOwner: false,
      isAdmin: false,
    };
  }

  const isAdmin =
    user.permissionLevel === UserRole.ADMIN || user.permissionLevel === UserRole.MODERATOR;

  const isHomeOwner = isTeamOwner(match.homeTeam, user.steamId);
  const isAwayOwner = isTeamOwner(match.awayTeam, user.steamId);

  const canManage = isAdmin || isHomeOwner || isAwayOwner;

  return { canManage, isHomeOwner, isAwayOwner, isAdmin };
}

/**
 * Determine whether a user owns a match team.
 * For 1v1 (single-person) entries the sole active member is the owner, so a
 * stale permission level (e.g. left over from a prior disband/leave) does not
 * lock the player out of their own match.
 */
function isTeamOwner(
  team: {
    formatId: number;
    players: Array<{ playerSteamId: string; permissionLevel: number; active: number }>;
  },
  steamId: string,
): boolean {
  const isSoloEntry = team.formatId === FORMAT_1V1;
  return team.players.some(
    (p) =>
      p.playerSteamId === steamId && p.active === 1 && (isSoloEntry || p.permissionLevel === 2),
  );
}

/**
 * Validate score submission
 * Ensures scores are valid integers and match exists
 */
export function validateScoreSubmission(
  scores: Record<string, number>,
  boSeries: number,
): { valid: boolean; error?: string } {
  for (const [key, value] of Object.entries(scores)) {
    if (!Number.isInteger(value) || value < 0) {
      return { valid: false, error: 'Invalid score value' };
    }
  }

  return { valid: true };
}

interface GameResult {
  gameNum: number;
  homeScore: number;
  awayScore: number;
  arenaId?: number;
}

/**
 * Tally how many arenas each side won for a playoff series.
 * Games are grouped into arenas of `gamesPerArena` consecutive game numbers
 * (arena 1 = games 1..gamesPerArena, arena 2 = next block, etc.). An arena is
 * won by the side that wins the majority of its games.
 */
function tallyArenaWins(
  gameResults: GameResult[],
  gamesPerArena: number,
): { homeArenaWins: number; awayArenaWins: number } {
  const arenaTally = new Map<number, { home: number; away: number }>();

  for (const game of gameResults) {
    const arenaIndex = Math.floor((game.gameNum - 1) / gamesPerArena);
    const tally = arenaTally.get(arenaIndex) ?? { home: 0, away: 0 };
    if (game.homeScore > game.awayScore) {
      tally.home++;
    } else if (game.awayScore > game.homeScore) {
      tally.away++;
    }
    arenaTally.set(arenaIndex, tally);
  }

  let homeArenaWins = 0;
  let awayArenaWins = 0;
  for (const tally of arenaTally.values()) {
    if (tally.home > tally.away) {
      homeArenaWins++;
    } else if (tally.away > tally.home) {
      awayArenaWins++;
    }
  }

  return { homeArenaWins, awayArenaWins };
}

/**
 * Calculate match winner from game results.
 *
 * For regular matches the winning units are individual games. For playoff
 * matches with `boGames > 1`, each arena is a best-of-`boGames` sub-series and
 * the winning units are arenas won. `winnerScore`/`loserScore` therefore
 * represent arena wins for playoff series and game wins otherwise.
 *
 * `homePointsScored`/`awayPointsScored` always sum the raw points of every game.
 */
export function calculateMatchWinner(
  homeTeamId: number,
  awayTeamId: number,
  gameResults: GameResult[],
  boGames?: number | null,
): {
  winnerId: number | null;
  winnerScore: number;
  loserScore: number;
  homePointsScored: number;
  awayPointsScored: number;
} {
  let homePointsScored = 0;
  let awayPointsScored = 0;

  for (const game of gameResults) {
    homePointsScored += game.homeScore;
    awayPointsScored += game.awayScore;
  }

  let homeUnits = 0;
  let awayUnits = 0;

  if (boGames && boGames > 1) {
    const { homeArenaWins, awayArenaWins } = tallyArenaWins(gameResults, boGames);
    homeUnits = homeArenaWins;
    awayUnits = awayArenaWins;
  } else {
    for (const game of gameResults) {
      if (game.homeScore > game.awayScore) {
        homeUnits++;
      } else if (game.awayScore > game.homeScore) {
        awayUnits++;
      }
    }
  }

  let winnerId: number | null = null;
  let winnerScore = 0;
  let loserScore = 0;

  if (homeUnits > awayUnits) {
    winnerId = homeTeamId;
    winnerScore = homeUnits;
    loserScore = awayUnits;
  } else if (awayUnits > homeUnits) {
    winnerId = awayTeamId;
    winnerScore = awayUnits;
    loserScore = homeUnits;
  }

  return {
    winnerId,
    winnerScore,
    loserScore,
    homePointsScored,
    awayPointsScored,
  };
}

/**
 * Submit match scores and update all related data
 */
export async function submitMatchScores(
  matchId: number,
  gameResults: GameResult[],
  submittedBy: string,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, submitScore } = await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) notFound('Match not found');
    if (String(match.status) !== 'UNPLAYED') {
      badRequest('Match scores have already been submitted');
    }

    const homeTeamId = Number(match.homeTeamId);
    const awayTeamId = Number(match.awayTeamId);
    const { winnerId, winnerScore, loserScore } = calculateMatchWinner(
      homeTeamId,
      awayTeamId,
      gameResults,
      match.boGames != null ? Number(match.boGames) : null,
    );

    // MatchModule score-error treats scores as series wins vs boGames; Bo1 frag
    // totals (e.g. 8–2) still satisfy (>= boGames && > opponent).
    const homeScore = gameResults.reduce((s, g) => s + g.homeScore, 0);
    const awayScore = gameResults.reduce((s, g) => s + g.awayScore, 0);
    const ack = await submitScore(client, {
      matchId: String(matchId),
      homeScore,
      awayScore,
      submittedBy,
      submittedAt: new Date().toISOString(),
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to submit scores');

    const opposingTeamId =
      (await (async () => {
        const { createTeamsClient, getRoster } = await import('$lib/server/rama/teams');
        const teams = createTeamsClient(ramaClientOpts());
        for (const teamId of [homeTeamId, awayTeamId]) {
          const roster = await getRoster(teams, String(teamId));
          if (roster[submittedBy]?.active) {
            return teamId === homeTeamId ? awayTeamId : homeTeamId;
          }
        }
        return null;
      })()) ?? null;

    if (opposingTeamId != null) {
      await createNotificationForTeamOwners(
        [opposingTeamId],
        'MATCH_COMM',
        `/matches/${matchId}`,
        `Score submitted: ${winnerScore}-${loserScore}`,
        submittedBy,
      );
    }

    return { winnerId, winnerScore, loserScore };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Lock the match row for the duration of this transaction so concurrent
    // submissions cannot both pass the UNPLAYED check simultaneously.
    const rows = await tx.$queryRaw<{ id: number; status: string }[]>`
      SELECT id, status FROM matches WHERE id = ${matchId} FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) notFound('Match not found');
    if (locked.status !== 'UNPLAYED') {
      badRequest('Match scores have already been submitted');
    }

    const match = await tx.match.findUnique({
      where: { id: matchId },
      include: { homeTeam: true, awayTeam: true, games: true },
    });

    if (!match) notFound('Match not found');

    const { winnerId, winnerScore, loserScore, homePointsScored, awayPointsScored } =
      calculateMatchWinner(match.homeTeamId, match.awayTeamId, gameResults, match.boGames);

    for (const r of gameResults) {
      await tx.game.updateMany({
        where: { matchId, gameNum: r.gameNum },
        data: {
          homeTeamScore: r.homeScore,
          awayTeamScore: r.awayScore,
          arenaId: r.arenaId || null,
        },
      });
    }

    await tx.team.update({
      where: { id: match.homeTeamId },
      data: {
        wins: { increment: winnerId === match.homeTeamId ? 1 : 0 },
        losses: { increment: winnerId === match.awayTeamId ? 1 : 0 },
        gamesWon: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
        gamesLost: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
        pointsScored: { increment: homePointsScored },
        pointsScoredAgainst: { increment: awayPointsScored },
      },
    });

    await tx.team.update({
      where: { id: match.awayTeamId },
      data: {
        wins: { increment: winnerId === match.awayTeamId ? 1 : 0 },
        losses: { increment: winnerId === match.homeTeamId ? 1 : 0 },
        gamesWon: { increment: gameResults.filter((g) => g.awayScore > g.homeScore).length },
        gamesLost: { increment: gameResults.filter((g) => g.homeScore > g.awayScore).length },
        pointsScored: { increment: awayPointsScored },
        pointsScoredAgainst: { increment: homePointsScored },
      },
    });

    await tx.match.update({
      where: { id: matchId },
      data: {
        winnerId,
        winnerScore,
        loserScore,
        status: MatchStatus.PLAYED,
        submittedBy,
        submittedAt: new Date(),
      },
    });

    await tx.matchComm.updateMany({
      where: { matchId, rescheduleStatus: 0 },
      data: { rescheduleStatus: 3 }, // Canceled
    });

    return {
      winnerId,
      winnerScore,
      loserScore,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    };
  });

  // Notifications run outside the transaction — non-critical side effects
  const submitterTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: submittedBy,
      teamId: { in: [result.homeTeamId, result.awayTeamId] },
      active: 1,
    },
  });

  if (submitterTeam) {
    const opposingTeamId =
      submitterTeam.teamId === result.homeTeamId ? result.awayTeamId : result.homeTeamId;

    await createNotificationForTeamOwners(
      [opposingTeamId],
      'MATCH_COMM',
      `/matches/${matchId}`,
      `Score submitted: ${result.winnerScore}-${result.loserScore}`,
      submittedBy,
    );
  }

  return {
    winnerId: result.winnerId,
    winnerScore: result.winnerScore,
    loserScore: result.loserScore,
  };
}

/**
 * File a match dispute
 * Must be within 24 hours of submission
 */
export async function disputeMatch(matchId: number, reason: string, disputedBy: string) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, nextCommId, postComm, setMatchStatus } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) notFound('Match not found');
    if (String(match.status) !== 'PLAYED') badRequest('Can only dispute played matches');

    const submittedAtRaw = match.submittedAt ? String(match.submittedAt) : '';
    if (!submittedAtRaw) badRequest('No submission timestamp found');
    const submittedTime = new Date(submittedAtRaw).getTime();
    if (Number.isNaN(submittedTime)) badRequest('No submission timestamp found');
    if ((Date.now() - submittedTime) / (1000 * 3600) > 24) {
      badRequest('Dispute period has passed (24 hours)');
    }

    const statusAck = await setMatchStatus(client, {
      matchId: String(matchId),
      status: 'DISPUTE',
    });
    if (!statusAck.ok) badRequest(statusAck.error || 'Failed to dispute match');

    const commAck = await postComm(client, {
      matchId: String(matchId),
      commId: nextCommId(),
      owner: disputedBy,
      content: `MATCH DISPUTED: ${reason}`,
    });
    if (!commAck.ok) badRequest(commAck.error || 'Failed to post dispute message');

    await createNotificationForAdmins(
      'MATCH_COMM',
      `/matches/${matchId}`,
      `Match disputed: ${reason.substring(0, 50)}${reason.length > 50 ? '...' : ''}`,
      disputedBy,
    );

    const homeTeamId = Number(match.homeTeamId);
    const awayTeamId = Number(match.awayTeamId);
    const { createTeamsClient, getRoster } = await import('$lib/server/rama/teams');
    const teams = createTeamsClient(ramaClientOpts());
    let opposingTeamId: number | null = null;
    for (const teamId of [homeTeamId, awayTeamId]) {
      const roster = await getRoster(teams, String(teamId));
      if (roster[disputedBy]?.active) {
        opposingTeamId = teamId === homeTeamId ? awayTeamId : homeTeamId;
        break;
      }
    }
    if (opposingTeamId != null) {
      await createNotificationForTeamOwners(
        [opposingTeamId],
        'MATCH_COMM',
        `/matches/${matchId}`,
        'Match has been disputed',
        disputedBy,
      );
    }
    return;
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    notFound('Match not found');
  }

  if (match.status !== MatchStatus.PLAYED) {
    badRequest('Can only dispute played matches');
  }

  if (!match.submittedAt) {
    badRequest('No submission timestamp found');
  }

  const now = Date.now();
  const submittedTime = match.submittedAt.getTime();
  const hoursSinceSubmission = (now - submittedTime) / (1000 * 3600);

  if (hoursSinceSubmission > 24) {
    badRequest('Dispute period has passed (24 hours)');
  }

  // Update match status to DISPUTE
  await prisma.match.update({
    where: { id: matchId },
    data: {
      status: MatchStatus.DISPUTE,
    },
  });

  // Create dispute message
  await prisma.matchComm.create({
    data: {
      matchId,
      owner: disputedBy,
      content: `MATCH DISPUTED: ${reason}`,
      createdAt: new Date(),
    },
  });

  // Notify admins about the dispute
  await createNotificationForAdmins(
    'MATCH_COMM',
    `/matches/${matchId}`,
    `Match disputed: ${reason.substring(0, 50)}${reason.length > 50 ? '...' : ''}`,
    disputedBy,
  );

  // Determine which team the disputer is on to notify the opposing team
  const disputerTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: disputedBy,
      teamId: { in: [match.homeTeamId, match.awayTeamId] },
      active: 1,
    },
  });

  if (disputerTeam) {
    const opposingTeamId =
      disputerTeam.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;

    // Notify opposing team about the dispute
    await createNotificationForTeamOwners(
      [opposingTeamId],
      'MATCH_COMM',
      `/matches/${matchId}`,
      'Match has been disputed',
      disputedBy,
    );
  }
}
