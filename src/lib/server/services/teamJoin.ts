/**
 * Team Join Service
 * Handles team joining via token and password
 */

import { prisma } from '$lib/server/db';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { validateJoinToken } from './teamSignup';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import { verifyPassword } from '$lib/server/utils/password';

interface TeamJoinInfo {
  team: any;
  activePlayers: any[];
  canJoin: boolean;
  error?: string;
}

/**
 * Validate join token and get team info
 */
export async function validateTokenAndGetTeam(
  token: string,
  steamId?: string,
): Promise<TeamJoinInfo> {
  // Decode and validate token
  const { teamId } = validateJoinToken(token);

  // Get team info
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: true,
      region: true,
      season: true,
      players: {
        where: { active: 1 },
        include: {
          player: true,
        },
      },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  // Block joining 1v1 "teams" - they're individual entries, not actual teams
  if (team.formatId === FORMAT_1V1) {
    return {
      team,
      activePlayers: team.players,
      canJoin: false,
      error: '1v1 entries cannot be joined - they are individual player entries',
    };
  }

  const activePlayers = team.players;

  // Check if user is trying to join their own team
  if (steamId) {
    const isTeamMember = activePlayers.some(
      (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
    );
    if (isTeamMember) {
      return {
        team,
        activePlayers,
        canJoin: false,
        error: 'You cannot invite yourself to your own team',
      };
    }
  }

  // Check if team is full
  if (activePlayers.length >= 3) {
    return {
      team,
      activePlayers,
      canJoin: false,
      error: 'Team is full (maximum 3 players)',
    };
  }

  return {
    team,
    activePlayers,
    canJoin: true,
  };
}

/**
 * Validate join password
 * Supports both hashed passwords (new) and plaintext (legacy, for migration)
 */
export async function validateJoinPassword(teamId: number, password: string): Promise<boolean> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { joinPassword: true },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (!team.joinPassword) {
    return false;
  }

  // Use secure password verification (handles both hashed and legacy plaintext)
  return verifyPassword(password, team.joinPassword);
}

/**
 * Join team by password — validates the password then creates a PendingPlayer
 * record with status=1 (awaiting admin approval).
 */
export async function joinByPassword(
  teamId: number,
  steamId: string,
  password: string,
): Promise<void> {
  const isValid = await validateJoinPassword(teamId, password);
  if (!isValid) {
    badRequest('Incorrect team password');
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: { where: { active: 1 } },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (team.formatId === FORMAT_1V1) {
    badRequest('Cannot join 1v1 teams');
  }

  if (team.players.length >= 3) {
    badRequest('Team is full (maximum 3 players)');
  }

  const isTeamMember = team.players.some(
    (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
  );
  if (isTeamMember) {
    badRequest('You are already on this team');
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: { in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1] },
      },
    },
  });

  if (playerInOtherTeam) {
    badRequest('You are already in another 2v2 team for this season');
  }

  await prisma.pendingPlayer.upsert({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    create: { playerSteamId: steamId, teamId, status: 1 },
    update: { status: 1 },
  });
}

/**
 * Accept invite by token — creates a PendingPlayer record with status=1
 * (awaiting admin approval). Returns teamId for redirect.
 */
export async function acceptInviteByToken(token: string, steamId: string): Promise<number> {
  const { teamId } = validateJoinToken(token);

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: { where: { active: 1 } },
    },
  });

  if (!team) {
    notFound('Team not found');
  }

  if (team.formatId === FORMAT_1V1) {
    badRequest('Cannot join 1v1 teams');
  }

  const isTeamMember = team.players.some(
    (p) => p.playerSteamId === steamId && p.permissionLevel >= 0,
  );
  if (isTeamMember) {
    badRequest('You cannot invite yourself to your own team');
  }

  if (team.players.length >= 3) {
    badRequest('Team is full (maximum 3 players)');
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: { in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1] },
      },
    },
  });

  if (playerInOtherTeam) {
    badRequest('You are already in another 2v2 team for this season');
  }

  await prisma.pendingPlayer.upsert({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    create: { playerSteamId: steamId, teamId, status: 1 },
    update: { status: 1 },
  });

  return teamId;
}

/**
 * Accept a Steam ID invite — upgrades the player's PendingPlayer record
 * from status=0 (team invite) to status=1 (awaiting admin approval).
 */
export async function acceptTeamInvite(steamId: string, teamId: number): Promise<void> {
  const pending = await prisma.pendingPlayer.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
  });

  if (!pending || pending.status !== 0) {
    badRequest('No pending invitation found for this team');
  }

  await prisma.pendingPlayer.update({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    data: { status: 1 },
  });
}

/**
 * Get all pending records for a user (both status=0 team invites and
 * status=1 awaiting-admin requests).
 */
export async function getUserPendingInvites(steamId: string) {
  return await prisma.pendingPlayer.findMany({
    where: { playerSteamId: steamId },
    include: {
      team: {
        include: {
          division: true,
          region: true,
          season: true,
          players: { where: { active: 1 } },
        },
      },
    },
    orderBy: { teamId: 'asc' },
  });
}

/**
 * Check if a player is in a specific team
 */
export async function isPlayerInTeam(steamId: string, teamId: number): Promise<boolean> {
  const playerInTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      teamId,
      active: 1,
      permissionLevel: {
        gte: 0,
      },
    },
  });

  return !!playerInTeam;
}

/**
 * Check if a player is in any active 2v2 team for the current signup season
 * (allows being in old season teams)
 */
export async function isPlayerInAnyActiveTeam(steamId: string): Promise<boolean> {
  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: {
          in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1],
        },
      },
    },
  });

  return !!playerInOtherTeam;
}

/**
 * Returns the status of a player's pending record for a specific team,
 * or null if no record exists.
 * 0 = team invite awaiting player acceptance
 * 1 = awaiting admin approval
 */
export async function getPendingStatusForTeam(
  steamId: string,
  teamId: number,
): Promise<number | null> {
  const pending = await prisma.pendingPlayer.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    select: { status: true },
  });
  return pending?.status ?? null;
}

/**
 * Returns true if the player has an active join request (status=1) for any team.
 * status=0 records are unaccepted invites and do not block joining elsewhere.
 */
export async function hasAnyPendingRequest(steamId: string): Promise<boolean> {
  const pending = await prisma.pendingPlayer.findFirst({
    where: { playerSteamId: steamId, status: 1 },
    select: { teamId: true },
  });
  return !!pending;
}

/**
 * Decline/delete pending invitation
 */
export async function declineInvitation(steamId: string, teamId: number): Promise<void> {
  await prisma.pendingPlayer.deleteMany({
    where: {
      playerSteamId: steamId,
      teamId,
    },
  });
}
