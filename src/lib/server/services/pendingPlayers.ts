/**
 * Pending Players Service
 *
 * Single source of truth for approving/declining pending player join requests.
 * Audit logging is built in — callers pass an AuditContext so every code path
 * is automatically tracked.
 */

import { prisma } from '$lib/server/db';
import { badRequest } from '$lib/server/utils/errors';
import { FORMAT_2V2 } from '$lib/server/constants/formats';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { logAudit, AuditCategory, AuditAction } from './auditLog';

export interface AuditContext {
  actorId: string;
  actorRole: string;
  ipAddress: string;
}

/**
 * Get all pending player requests with related data
 */
export async function getPendingPlayers() {
  return await prisma.pendingPlayer.findMany({
    where: { status: 1 },
    include: {
      player: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
      team: {
        select: {
          id: true,
          name: true,
          seasonId: true,
          divisionId: true,
          regionId: true,
          division: {
            select: {
              id: true,
              name: true,
              signupCost: true,
            },
          },
          region: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      playerSteamId: 'asc',
    },
  });
}

/**
 * Approve a pending player and add them to the team.
 * Validates roster size, duplicate season membership, computes payment status,
 * cleans up stale memberships, and logs the action.
 */
export async function approvePlayer(playerSteamId: string, teamId: number, audit: AuditContext) {
  const activePlayersCount = await prisma.playerInTeam.count({
    where: { teamId, active: 1 },
  });
  if (activePlayersCount >= 3) {
    badRequest('Team is full (maximum 3 players)');
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId,
      active: 1,
      team: {
        formatId: FORMAT_2V2,
        seasonId: {
          in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1],
        },
      },
    },
  });
  if (playerInOtherTeam) {
    badRequest('Player is already in another 2v2 team for this season');
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { division: { select: { signupCost: true } } },
  });
  if (!team?.seasonId || !team?.divisionId) {
    badRequest('Team missing season or division');
  }

  const payment = await prisma.paymentTracker.findUnique({
    where: {
      playerSteamId_seasonId: {
        playerSteamId,
        seasonId: team.seasonId,
      },
    },
  });
  const amountPaid = payment?.amount || 0;
  const signupCost = team.division?.signupCost || 0;
  const paymentStatus = amountPaid >= signupCost ? 1 : 0;

  await prisma.$transaction(async (tx) => {
    await tx.playerInTeam.updateMany({
      where: {
        playerSteamId,
        active: 1,
        team: {
          formatId: FORMAT_2V2,
          seasonId: { not: team.seasonId },
        },
      },
      data: {
        active: 0,
        leftAt: new Date(),
      },
    });

    await tx.playerInTeam.upsert({
      where: {
        playerSteamId_teamId: { playerSteamId, teamId },
      },
      create: {
        playerSteamId,
        teamId,
        active: 1,
        permissionLevel: 0,
        paymentStatus,
      },
      update: {
        active: 1,
        permissionLevel: 0,
        paymentStatus,
        startedAt: new Date(),
      },
    });

    await tx.pendingPlayer.delete({
      where: {
        playerSteamId_teamId: { playerSteamId, teamId },
      },
    });

    const paidPlayersCount = await tx.playerInTeam.count({
      where: { teamId, active: 1, paymentStatus: 1 },
    });

    await tx.team.update({
      where: { id: teamId },
      data: {
        paymentStatus: paidPlayersCount >= 2 ? 1 : 0,
      },
    });
  });

  await logAudit({
    actorId: audit.actorId,
    actorRole: audit.actorRole,
    category: AuditCategory.ROSTER,
    action: AuditAction.PLAYER_APPROVED,
    targetType: 'Team',
    targetId: String(teamId),
    metadata: { playerSteamId },
    ipAddress: audit.ipAddress,
  });
}

/**
 * Decline a pending player request.
 * Always creates a DeniedPlayer record for the audit trail.
 * `reason` is optional — admin routes enforce it at the form-validation level,
 * but team captains may decline without one.
 */
export async function declinePlayer(
  playerSteamId: string,
  teamId: number,
  audit: AuditContext,
  reason?: string,
) {
  await prisma.$transaction(async (tx) => {
    await tx.deniedPlayer.create({
      data: {
        playerSteamId,
        teamId,
        reason: reason || null,
        adminId: audit.actorId,
      },
    });

    await tx.pendingPlayer.delete({
      where: {
        playerSteamId_teamId: { playerSteamId, teamId },
      },
    });
  });

  await logAudit({
    actorId: audit.actorId,
    actorRole: audit.actorRole,
    category: AuditCategory.ROSTER,
    action: AuditAction.PLAYER_DENIED,
    targetType: 'Team',
    targetId: String(teamId),
    metadata: { playerSteamId, ...(reason ? { reason } : {}) },
    ipAddress: audit.ipAddress,
  });
}
