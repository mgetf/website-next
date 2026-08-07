/**
 * Map Ban/Pick System Service
 * Handles turn-based map ban and pick phases for matches
 */

import { prisma } from '$lib/server/db';
import type { Match, MatchMapBan } from '$prisma/client.js';
import { MapBanActionType } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { determineNextAction, shouldSwitchTurn } from '$lib/server/utils/mapBanLogic';

export { determineNextAction, shouldSwitchTurn };

/**
 * Process a ban or pick action
 */
export async function processBanPickAction(
  matchMapBanId: number,
  teamId: number,
  playerSteamId: string,
  arenaId: number,
  actionType: 'ban' | 'pick',
) {
  const matchMapBan = await prisma.matchMapBan.findUnique({
    where: { id: matchMapBanId },
    include: {
      match: true,
      actions: {
        orderBy: { actionOrder: 'asc' },
      },
    },
  });

  if (!matchMapBan) {
    notFound('Map ban phase not found');
  }

  if (matchMapBan.banPhaseComplete) {
    badRequest('Map ban phase already complete');
  }

  const match = matchMapBan.match;
  if (!match) {
    badRequest('Match not found for map ban');
  }
  const actionCount = matchMapBan.actions.length;

  // Verify correct action type
  const expectedAction = determineNextAction(actionCount, match.boSeries || 3);
  if (expectedAction !== actionType) {
    badRequest(`Expected ${expectedAction} action, got ${actionType}`);
  }

  // Verify correct team's turn
  const expectedTeamId = matchMapBan.currentTurn === 0 ? match.homeTeamId : match.awayTeamId;
  if (expectedTeamId !== teamId) {
    badRequest('Not your turn');
  }

  // Check if arena already banned or picked
  const existingAction = matchMapBan.actions.find((a) => a.arenaId === arenaId);
  if (existingAction) {
    badRequest('Arena already banned or picked');
  }

  // Create action
  const action = await prisma.mapBanAction.create({
    data: {
      matchMapBanId,
      teamId,
      playerSteamId,
      arenaId,
      actionType: actionType === 'ban' ? MapBanActionType.BAN : MapBanActionType.PICK,
      actionOrder: actionCount,
    },
  });

  // If it's a pick, assign map to games
  if (actionType === 'pick') {
    const pickCount =
      matchMapBan.actions.filter((a) => a.actionType === MapBanActionType.PICK).length + 1; // +1 for current action
    await assignMapToGames(match.id, arenaId, pickCount, match.boGames || null);
  }

  // Update match map ban
  // Bo3: 6 actions, Bo5: 8 actions, Bo7: 10 actions
  const totalActionsNeeded =
    match.boSeries === 3 ? 6 : match.boSeries === 5 ? 8 : match.boSeries === 7 ? 10 : 6;
  const isComplete = actionCount + 1 >= totalActionsNeeded;
  const shouldSwitch = shouldSwitchTurn(actionCount, match.boSeries || 3);

  await prisma.matchMapBan.update({
    where: { id: matchMapBanId },
    data: {
      currentTurn: shouldSwitch ? (matchMapBan.currentTurn === 0 ? 1 : 0) : matchMapBan.currentTurn,
      banPhaseComplete: isComplete,
      completedAt: isComplete ? new Date() : null,
    },
  });

  // TODO: Notify opposing team of ban/pick action (F19)

  return action;
}

/**
 * Assign picked map to game(s)
 * @param matchId - Match ID
 * @param arenaId - Arena/map ID
 * @param pickNumber - Which pick this is (1st, 2nd, 3rd, etc.)
 * @param boGames - Games per arena for playoffs (null for regular season)
 */
export async function assignMapToGames(
  matchId: number,
  arenaId: number,
  pickNumber: number,
  boGames: number | null,
) {
  if (boGames && boGames > 1) {
    // Playoff mode: multiple games per arena
    const gamesPerArena = boGames;
    const startGameNum = (pickNumber - 1) * gamesPerArena + 1;
    const endGameNum = pickNumber * gamesPerArena;

    for (let gameNum = startGameNum; gameNum <= endGameNum; gameNum++) {
      await prisma.game.updateMany({
        where: {
          matchId,
          gameNum,
        },
        data: {
          arenaId,
        },
      });
    }
  } else {
    // Regular season: one game per pick
    await prisma.game.updateMany({
      where: {
        matchId,
        gameNum: pickNumber,
      },
      data: {
        arenaId,
      },
    });
  }
}

/**
 * Get map ban status for a match
 */
export async function getMapBanStatus(matchId: number) {
  const matchMapBan = await prisma.matchMapBan.findFirst({
    where: { matchId },
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
      match: true,
    },
  });

  if (!matchMapBan) {
    return null;
  }

  const bannedArenaIds = matchMapBan.actions
    .filter((a) => a.actionType === MapBanActionType.BAN)
    .map((a) => a.arenaId);

  const pickedArenaIds = matchMapBan.actions
    .filter((a) => a.actionType === MapBanActionType.PICK)
    .map((a) => a.arenaId);

  const availableArenas =
    matchMapBan.pool?.mapsInPool.filter(
      (m) => !bannedArenaIds.includes(m.arenaId) && !pickedArenaIds.includes(m.arenaId),
    ) ?? [];

  const nextAction = determineNextAction(
    matchMapBan.actions.length,
    matchMapBan.match?.boSeries || 3,
  );

  return {
    matchMapBan,
    availableArenas,
    bannedArenaIds,
    pickedArenaIds,
    nextAction,
    isComplete: matchMapBan.banPhaseComplete,
  };
}
