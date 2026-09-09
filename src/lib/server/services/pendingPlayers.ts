/**
 * Pending Players Service
 *
 * Single source of truth for approving/declining pending player join requests.
 * Audit logging is built in — callers pass an AuditContext so every code path
 * is automatically tracked.
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import type { PendingApproval } from '$lib/types/pendingApproval';
import { badRequest, notFound } from '$lib/server/utils/errors';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { logAudit, AuditCategory, AuditAction } from './auditLog';
import { syncTeamPaymentStatus } from './payments';
import { change1v1Status } from './signup1v1';
import { adminSetTeamStatus } from './teams';

export interface AuditContext {
  actorId: string;
  actorRole: string;
  ipAddress: string;
}

const pendingTeamSelect = {
  id: true,
  name: true,
  seasonId: true,
  divisionId: true,
  regionId: true,
  formatId: true,
  format: {
    select: {
      id: true,
      name: true,
      themeKey: true,
      isIndividual: true,
    },
  },
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
} as const;

/**
 * Join requests waiting for admin roster approval (PendingPlayer status=1).
 */
async function getPendingPlayers() {
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
      team: { select: pendingTeamSelect },
    },
    orderBy: {
      playerSteamId: 'asc',
    },
  });
}

/**
 * Unified admin inbox: roster join requests plus 1v1/2v2 entries that readied up
 * and are waiting for READY.
 */
export async function getPendingApprovals(): Promise<PendingApproval[]> {
  const [joinRequests, pendingEntries] = await Promise.all([
    getPendingPlayers(),
    prisma.team.findMany({
      where: { status: TeamStatus.PENDING },
      select: {
        ...pendingTeamSelect,
        players: {
          where: { active: 1 },
          select: {
            permissionLevel: true,
            paymentStatus: true,
            player: {
              select: {
                steamId: true,
                steamUsername: true,
                steamAvatar: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const joins: PendingApproval[] = joinRequests.map((request) => ({
    kind: 'JOIN_REQUEST',
    key: `join-${request.team.id}-${request.player.steamId}`,
    playerSteamId: request.player.steamId,
    playerUsername: request.player.steamUsername,
    playerAvatar: request.player.steamAvatar,
    teamId: request.team.id,
    teamName: request.team.name,
    formatId: request.team.format.id,
    formatName: request.team.format.name,
    formatThemeKey: request.team.format.themeKey,
    isIndividual: request.team.format.isIndividual,
    divisionId: request.team.divisionId,
    divisionName: request.team.division?.name ?? null,
    regionId: request.team.regionId,
    regionName: request.team.region?.name ?? null,
    paid: true,
  }));

  const entries: PendingApproval[] = pendingEntries.map((team) => {
    const captain =
      team.players.find((player) => player.permissionLevel >= 2) ?? team.players[0] ?? null;
    return {
      kind: 'ENTRY_READY',
      key: `entry-${team.id}`,
      playerSteamId: captain?.player.steamId ?? '',
      playerUsername: captain?.player.steamUsername ?? team.name,
      playerAvatar: captain?.player.steamAvatar ?? null,
      teamId: team.id,
      teamName: team.name,
      formatId: team.format.id,
      formatName: team.format.name,
      formatThemeKey: team.format.themeKey,
      isIndividual: team.format.isIndividual,
      divisionId: team.divisionId,
      divisionName: team.division?.name ?? null,
      regionId: team.regionId,
      regionName: team.region?.name ?? null,
      paid: captain ? captain.paymentStatus !== 0 : false,
    };
  });

  return [...joins, ...entries];
}

async function setPendingEntryStatus(
  teamId: number,
  newStatus: typeof TeamStatus.READY | typeof TeamStatus.UNREADY,
  audit: AuditContext,
  extraMetadata?: Record<string, string>,
) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, formatId: true, status: true },
  });
  if (!team) notFound('Entry not found');
  if (team.status !== TeamStatus.PENDING) {
    badRequest('This entry is not awaiting approval');
  }

  if (team.formatId === FORMAT_1V1) {
    await change1v1Status(teamId, newStatus);
  } else {
    await adminSetTeamStatus(teamId, newStatus);
  }

  await logAudit({
    actorId: audit.actorId,
    actorRole: audit.actorRole,
    category: AuditCategory.TEAM,
    action: AuditAction.TEAM_STATUS_CHANGED,
    targetType: 'Team',
    targetId: String(teamId),
    metadata: { oldStatus: TeamStatus.PENDING, newStatus, ...extraMetadata },
    ipAddress: audit.ipAddress,
  });
}

async function approvePendingEntry(teamId: number, audit: AuditContext) {
  await setPendingEntryStatus(teamId, TeamStatus.READY, audit);
}

async function declinePendingEntry(teamId: number, audit: AuditContext, reason?: string) {
  await setPendingEntryStatus(teamId, TeamStatus.UNREADY, audit, reason ? { reason } : undefined);
}

export async function approvePendingItem(
  kind: PendingApproval['kind'],
  teamId: number,
  playerSteamId: string,
  audit: AuditContext,
) {
  if (kind === 'ENTRY_READY') {
    await approvePendingEntry(teamId, audit);
    return;
  }
  if (!playerSteamId) badRequest('Invalid player');
  await approvePlayer(playerSteamId, teamId, audit);
}

export async function declinePendingItem(
  kind: PendingApproval['kind'],
  teamId: number,
  playerSteamId: string,
  audit: AuditContext,
  reason?: string,
) {
  if (kind === 'ENTRY_READY') {
    await declinePendingEntry(teamId, audit, reason);
    return;
  }
  if (!playerSteamId) badRequest('Invalid player');
  await declinePlayer(playerSteamId, teamId, audit, reason);
}

/**
 * Payment status for a newly approved roster member.
 * Unplaced teams (no division yet) stay unpaid until an admin assigns one.
 */
export function playerPaymentStatusOnApprove(options: {
  hasDivision: boolean;
  signupCost: number;
  amountPaid: number;
}): number {
  if (!options.hasDivision) return 0;
  if (options.signupCost === 0) return 2;
  return options.amountPaid >= options.signupCost ? 1 : 0;
}

/**
 * Approve a pending player and add them to the team.
 * Validates roster size, duplicate season membership, computes payment status,
 * cleans up stale memberships, and logs the action.
 * Teams may be unplaced (`divisionId` null) after deferred signup.
 */
export async function approvePlayer(playerSteamId: string, teamId: number, audit: AuditContext) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: { select: { signupCost: true } },
      format: true,
    },
  });
  if (!team?.seasonId) {
    badRequest('Team missing season');
  }

  const format = team.format;
  const hasDivision = team.divisionId != null;
  const activePlayersCount = await prisma.playerInTeam.count({
    where: { teamId, active: 1 },
  });
  if (activePlayersCount >= format.maxRosterSize) {
    badRequest(`Team is full (maximum ${format.maxRosterSize} players)`);
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds(team.formatId);
  const playerInOtherTeam = await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId,
      active: 1,
      team: {
        formatId: team.formatId,
        seasonId: {
          in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1],
        },
      },
    },
  });
  if (playerInOtherTeam) {
    badRequest('Player is already in another team for this format and season');
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
  const paymentStatus = playerPaymentStatusOnApprove({
    hasDivision,
    signupCost,
    amountPaid,
  });

  await prisma.$transaction(async (tx) => {
    await tx.playerInTeam.updateMany({
      where: {
        playerSteamId,
        active: 1,
        team: {
          formatId: team.formatId,
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

    // Unplaced teams stay unpaid until a division (and its fee) is assigned.
    if (hasDivision && signupCost === 0) {
      await tx.team.update({
        where: { id: teamId },
        data: { paymentStatus: 2 },
      });
    } else if (hasDivision) {
      await syncTeamPaymentStatus(tx, teamId, format.requiredPaidPlayers);
    }
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
