/**
 * Map Ban/Pick System Service
 * Handles turn-based map ban and pick phases for matches
 */

import { prisma } from '$lib/server/db';
import type { Match, MatchMapBan } from '$prisma/client.js';
import { MapBanActionType } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';

/**
 * Determine next action type (ban or pick) based on action count and BO series
 * @param actionCount - Number of actions already taken
 * @param boSeries - Best of series (3, 5, or 7)
 * @returns 'ban', 'pick', or '' if complete
 */
export function determineNextAction(actionCount: number, boSeries: number): 'ban' | 'pick' | '' {
  if (boSeries === 3) {
    // BO3 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  } else if (boSeries === 5) {
    // BO5 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick, Away pick, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick
      case 6:
        return 'pick'; // Away pick
      case 7:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  } else if (boSeries === 7) {
    // BO7 pattern: Away ban, Home ban, Home pick, Away pick, Away ban, Home pick, Away pick, Home pick, Away pick, Home pick
    switch (actionCount) {
      case 0:
        return 'ban'; // Away ban
      case 1:
        return 'ban'; // Home ban
      case 2:
        return 'pick'; // Home pick
      case 3:
        return 'pick'; // Away pick
      case 4:
        return 'ban'; // Away ban
      case 5:
        return 'pick'; // Home pick
      case 6:
        return 'pick'; // Away pick
      case 7:
        return 'pick'; // Home pick
      case 8:
        return 'pick'; // Away pick
      case 9:
        return 'pick'; // Home pick (final)
      default:
        return '';
    }
  }

  return '';
}

/**
 * Determine if turn should switch after an action
 * @param actionCount - Number of actions already taken (before this action)
 * @param boSeries - Best of series (3, 5, or 7)
 * @returns true if turn should switch to other team
 */
export function shouldSwitchTurn(actionCount: number, boSeries: number): boolean {
  if (boSeries === 3) {
    // BO3 pattern: Away→Home→Home→Away→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for final pick
      default:
        return false;
    }
  } else if (boSeries === 5) {
    // BO5 pattern: Away→Home→Home→Away→Away→Home→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for pick
      case 5:
        return true; // After Home pick, switch to Away for pick
      case 6:
        return true; // After Away pick, switch to Home for final pick
      default:
        return false;
    }
  } else if (boSeries === 7) {
    // BO7 pattern: Away→Home→Home→Away→Away→Home→Away→Home→Away→Home
    switch (actionCount) {
      case 0:
        return true; // After Away ban, switch to Home
      case 1:
        return false; // After Home ban, stay on Home for pick
      case 2:
        return true; // After Home pick, switch to Away
      case 3:
        return false; // After Away pick, stay on Away for ban
      case 4:
        return true; // After Away ban, switch to Home for pick
      case 5:
        return true; // After Home pick, switch to Away for pick
      case 6:
        return true; // After Away pick, switch to Home for pick
      case 7:
        return true; // After Home pick, switch to Away for pick
      case 8:
        return true; // After Away pick, switch to Home for final pick
      default:
        return false;
    }
  }

  return false;
}

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
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // Under Rama, matchMapBan.id is synthesized as the match id.
    const matchId = matchMapBanId;
    const status = await getMapBanStatus(matchId);
    if (!status || status.isComplete) {
      badRequest('Map ban phase not active');
    }
    const banMatch = status.matchMapBan.match;
    if (!banMatch) {
      badRequest('Match not found for map ban');
    }
    const expectedAction = status.nextAction;
    if (expectedAction !== actionType) {
      badRequest(`Expected ${expectedAction} action, got ${actionType}`);
    }
    const expectedTeamId =
      status.matchMapBan.currentTurn === 0 ? banMatch.homeTeamId : banMatch.awayTeamId;
    if (expectedTeamId !== teamId) {
      badRequest('Not your turn');
    }
    if (status.bannedArenaIds.includes(arenaId) || status.pickedArenaIds.includes(arenaId)) {
      badRequest('Arena already banned or picked');
    }

    const { createMatchClient, banMap } = await import('$lib/server/rama/match');
    const ack = await banMap(createMatchClient(ramaClientOpts()), {
      type: 'ban-map',
      matchId: String(matchId),
      teamId: String(teamId),
      arenaId: String(arenaId),
      actionType,
    });
    if (!ack.ok) {
      badRequest(ack.error || 'Failed to ban/pick map');
    }
    void playerSteamId;
    return {
      id: Date.now(),
      matchMapBanId,
      teamId,
      playerSteamId,
      arenaId,
      actionType: actionType === 'ban' ? MapBanActionType.BAN : MapBanActionType.PICK,
      actionOrder: status.matchMapBan.actions.length,
    };
  }

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
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMapBan } = await import('$lib/server/rama/match');
    const { createMapPoolsClient, getArena } = await import('$lib/server/rama/mapPools');
    const { getTeamById } = await import('$lib/server/services/teams');

    const opts = ramaClientOpts();
    const ban = await getMapBan(createMatchClient(opts), String(matchId));
    if (!ban) return null;

    const remaining = Array.isArray(ban.remaining)
      ? (ban.remaining as string[])
      : ban.remaining && typeof ban.remaining === 'object'
        ? Object.keys(ban.remaining as object)
        : [];
    const actions = Array.isArray(ban.actions) ? ban.actions : [];
    // Empty pool + no actions → week match with fixed arena; hide map-ban UI.
    if (remaining.length === 0 && actions.length === 0) return null;

    const homeTeamId = Number(ban.homeTeamId);
    const awayTeamId = Number(ban.awayTeamId);
    const boSeries = Number(ban.boSeries ?? 3) || 3;
    const poolsClient = createMapPoolsClient(opts);

    const mappedActions = [];
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i]!;
      const arenaNum = Number(a.arenaId);
      const teamNum = Number(a.teamId);
      const [arenaRow, team] = await Promise.all([
        Number.isFinite(arenaNum) ? getArena(poolsClient, String(arenaNum)) : null,
        Number.isFinite(teamNum) ? getTeamById(teamNum) : null,
      ]);
      const actionType =
        String(a.actionType).toLowerCase() === 'pick'
          ? MapBanActionType.PICK
          : MapBanActionType.BAN;
      mappedActions.push({
        id: i + 1,
        matchMapBanId: matchId,
        teamId: teamNum,
        playerSteamId: '',
        arenaId: arenaNum,
        actionType,
        actionOrder: i,
        team: team ? { id: team.id, name: team.name } : null,
        player: null,
        arena: arenaRow
          ? {
              id: arenaNum,
              name: arenaRow.name,
              avatar: arenaRow.avatar || null,
              playoffMap: Number(arenaRow.playoffMap ?? 0),
            }
          : { id: arenaNum, name: String(a.arenaId), avatar: null, playoffMap: 0 },
      });
    }

    const bannedArenaIds = mappedActions
      .filter((a) => a.actionType === MapBanActionType.BAN)
      .map((a) => a.arenaId);
    const pickedArenaIds = mappedActions
      .filter((a) => a.actionType === MapBanActionType.PICK)
      .map((a) => a.arenaId);

    const availableArenas = [];
    for (const arenaKey of remaining) {
      const arenaNum = Number(arenaKey);
      if (!Number.isFinite(arenaNum)) continue;
      if (bannedArenaIds.includes(arenaNum) || pickedArenaIds.includes(arenaNum)) continue;
      const arenaRow = await getArena(poolsClient, String(arenaNum));
      availableArenas.push({
        arenaId: arenaNum,
        orderNum: availableArenas.length,
        arena: arenaRow
          ? {
              id: arenaNum,
              name: arenaRow.name,
              avatar: arenaRow.avatar || null,
              playoffMap: Number(arenaRow.playoffMap ?? 0),
            }
          : { id: arenaNum, name: arenaKey, avatar: null, playoffMap: 0 },
      });
    }

    const nextAction = determineNextAction(mappedActions.length, boSeries);
    const currentTurn = Number(ban.turn ?? 1);

    return {
      matchMapBan: {
        id: matchId,
        matchId,
        currentTurn,
        banPhaseComplete: Boolean(ban.banPhaseComplete),
        actions: mappedActions,
        match: {
          id: matchId,
          homeTeamId,
          awayTeamId,
          boSeries,
          boGames: null as number | null,
        },
        pool: null,
      },
      availableArenas,
      bannedArenaIds,
      pickedArenaIds,
      nextAction,
      isComplete: Boolean(ban.banPhaseComplete),
    };
  }

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
