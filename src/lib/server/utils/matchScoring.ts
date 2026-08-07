/**
 * Pure match scoring and permission helpers.
 * Kept free of Prisma so unit tests and the matches service can share them.
 */

import { UserRole, type SessionUser } from '$lib/types/user';
import { FORMAT_1V1 } from '$lib/constants/formats';

export interface GameResult {
  gameNum: number;
  homeScore: number;
  awayScore: number;
  arenaId?: number;
}

type MatchTeamSide = {
  formatId: number;
  players: Array<{
    playerSteamId: string;
    permissionLevel: number;
    active: number;
  }>;
};

/**
 * Check if user can manage match (submit scores, dispute, etc.)
 * Team owners (permission=2) or admins/mods can manage
 */
export function canUserManageMatch(
  user: SessionUser | null,
  match: {
    homeTeam: MatchTeamSide;
    awayTeam: MatchTeamSide;
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
function isTeamOwner(team: MatchTeamSide, steamId: string): boolean {
  const isSoloEntry = team.formatId === FORMAT_1V1;
  return team.players.some(
    (p) =>
      p.playerSteamId === steamId && p.active === 1 && (isSoloEntry || p.permissionLevel === 2),
  );
}

/**
 * Validate score submission
 * Ensures scores are valid non-negative integers
 */
export function validateScoreSubmission(
  scores: Record<string, number>,
  _boSeries: number,
): { valid: boolean; error?: string } {
  for (const value of Object.values(scores)) {
    if (!Number.isInteger(value) || value < 0) {
      return { valid: false, error: 'Invalid score value' };
    }
  }

  return { valid: true };
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
