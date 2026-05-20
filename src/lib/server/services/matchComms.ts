/**
 * Match Communications Service
 * Handles match messages and reschedule requests
 */

import { prisma } from '$lib/server/db';
import type { User, Match, MatchComm } from '$prisma/client.js';
import { MatchStatus, UserRole } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

const RESCHEDULE_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESCHEDULE_STATUS_PENDING = 0;
const RESCHEDULE_STATUS_ACCEPTED = 1;
const RESCHEDULE_REQUEST_PREFIX = 'RESCHEDULE REQUESTED:';

export function formatRescheduleDateTime(
  value: string | Date | null | undefined,
  timeZone = 'UTC',
): string | null {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return date.toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
      hour12: true,
    });
  } catch {
    return null;
  }
}

export function getRescheduleDisplay(comm: MatchComm, fallbackTimeZone = 'UTC'): string {
  const content = comm.content?.trim() ?? '';
  if (content.startsWith(RESCHEDULE_REQUEST_PREFIX)) {
    const contentTime = content.slice(RESCHEDULE_REQUEST_PREFIX.length).trim();
    if (contentTime && !/^\d{4}-\d{2}-\d{2}T/.test(contentTime)) {
      return contentTime;
    }
  }

  return formatRescheduleDateTime(comm.reschedule, fallbackTimeZone) ?? comm.reschedule ?? '';
}

/**
 * Create a match communication (message or reschedule request)
 */
export async function createMatchComm(
  matchId: number,
  userId: string,
  content: string,
  rescheduleData?: {
    proposedDateTime: string;
    proposedTimezone?: string;
  },
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match) {
    notFound('Match not found');
  }

  const commData: any = {
    matchId,
    owner: userId,
    content,
    createdAt: new Date(),
  };

  if (rescheduleData) {
    commData.reschedule = rescheduleData.proposedDateTime;
    commData.rescheduleStatus = RESCHEDULE_STATUS_PENDING; // Pending
    commData.content = `${RESCHEDULE_REQUEST_PREFIX} ${
      formatRescheduleDateTime(rescheduleData.proposedDateTime, rescheduleData.proposedTimezone) ??
      rescheduleData.proposedDateTime
    }`;
  }

  const comm = await prisma.matchComm.create({
    data: commData,
  });

  // TODO: Create notifications for team owners/admins (excluding sender) (F19)

  return comm;
}

/**
 * Get pending reschedule request for a match
 */
export async function getPendingReschedule(matchId: number) {
  const reschedule = await prisma.matchComm.findFirst({
    where: {
      matchId,
      rescheduleStatus: RESCHEDULE_STATUS_PENDING, // Pending
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return reschedule;
}

/**
 * Get all reschedule requests for a match (for history)
 */
export async function getAllReschedules(matchId: number) {
  return await prisma.matchComm.findMany({
    where: {
      matchId,
      rescheduleStatus: { not: null },
    },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Check if user can respond to a reschedule request
 * Only the opposing team owner or admins can respond
 * Requester can cancel their own request
 */
export function canRespondToReschedule(
  user: { steamId: string; permissionLevel: UserRole } | null,
  comm: MatchComm,
  match: Match & {
    homeTeam: {
      players: Array<{
        playerSteamId: string;
        permissionLevel: number;
        active: number;
      }>;
    };
    awayTeam: {
      players: Array<{
        playerSteamId: string;
        permissionLevel: number;
        active: number;
      }>;
    };
  },
  action: 'accept' | 'deny' | 'cancel',
): boolean {
  if (!user) return false;

  const isAdmin =
    user.permissionLevel === UserRole.ADMIN || user.permissionLevel === UserRole.MODERATOR;

  if (isAdmin) return true;

  const homeOwners = match.homeTeam.players
    .filter((p) => p.permissionLevel === 2 && p.active === 1)
    .map((p) => p.playerSteamId);

  const awayOwners = match.awayTeam.players
    .filter((p) => p.permissionLevel === 2 && p.active === 1)
    .map((p) => p.playerSteamId);

  const isHomeOwner = homeOwners.includes(user.steamId);
  const isAwayOwner = awayOwners.includes(user.steamId);
  const isRequester = comm.owner === user.steamId;

  // Cancel: only requester or admin
  if (action === 'cancel') {
    return isRequester || isAdmin;
  }

  // Accept/Deny: only opposing team owner or admin (not requester)
  if (action === 'accept' || action === 'deny') {
    return !isRequester && (isHomeOwner || isAwayOwner || isAdmin);
  }

  return false;
}

/**
 * Update reschedule request status
 */
export async function updateRescheduleStatus(
  commId: number,
  status: 'accept' | 'deny' | 'cancel',
  respondedBy: string,
) {
  const comm = await prisma.matchComm.findUnique({
    where: { id: commId },
    include: {
      match: true,
    },
  });

  if (!comm) {
    notFound('Reschedule request not found');
  }

  if (comm.rescheduleStatus !== RESCHEDULE_STATUS_PENDING) {
    badRequest('Reschedule request already processed');
  }

  let newStatus: number;
  let responseMessage: string;

  if (status === 'accept') {
    newStatus = RESCHEDULE_STATUS_ACCEPTED; // Accepted
    responseMessage = 'MATCH RESPONSE: Reschedule request accepted.';

    // Update match date/time
    if (comm.reschedule) {
      await prisma.match.update({
        where: { id: comm.matchId },
        data: {
          matchDateTime: new Date(comm.reschedule),
        },
      });
    }
  } else if (status === 'deny') {
    newStatus = 2; // Denied
    responseMessage = 'MATCH RESPONSE: Reschedule request denied.';
  } else {
    // cancel
    newStatus = 3; // Canceled
    responseMessage = 'MATCH RESPONSE: Reschedule request canceled.';
  }

  // Update reschedule status
  await prisma.matchComm.update({
    where: { id: commId },
    data: {
      rescheduleStatus: newStatus,
    },
  });

  // Create response message
  await prisma.matchComm.create({
    data: {
      matchId: comm.matchId,
      owner: respondedBy,
      content: responseMessage,
      createdAt: new Date(),
    },
  });

  // TODO: Notify relevant parties of reschedule response (F19)

  return { newStatus, responseMessage };
}

/**
 * Calculate time remaining for reschedule response (24 hours)
 */
export function getRescheduleTimeRemaining(comm: MatchComm): {
  timeRemaining: string;
  expired: boolean;
} {
  if (!comm.createdAt) {
    return { timeRemaining: 'N/A', expired: false };
  }

  const now = Date.now();
  const createdTime = comm.createdAt.getTime();
  const deadline = createdTime + RESCHEDULE_RESPONSE_WINDOW_MS; // 24 hours in ms
  const msRemaining = deadline - now;

  if (msRemaining <= 0) {
    return { timeRemaining: '00:00:00', expired: true };
  }

  const secondsRemaining = Math.floor(msRemaining / 1000);
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const timeRemaining = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return { timeRemaining, expired: false };
}

/**
 * Check if a reschedule can be requested
 * Only allowed for UNPLAYED matches
 */
export function canRequestReschedule(match: Match): boolean {
  return match.status === MatchStatus.UNPLAYED;
}

export async function settleExpiredReschedules(matchId?: number): Promise<number> {
  const cutoff = new Date(Date.now() - RESCHEDULE_RESPONSE_WINDOW_MS);
  const expiredReschedules = await prisma.matchComm.findMany({
    where: {
      ...(matchId ? { matchId } : {}),
      rescheduleStatus: RESCHEDULE_STATUS_PENDING,
      createdAt: { lte: cutoff },
      reschedule: { not: null },
    },
    include: {
      match: {
        select: {
          id: true,
          status: true,
          matchDateTime: true,
          matchTimezone: true,
        },
      },
    },
  });

  let settledCount = 0;

  for (const comm of expiredReschedules) {
    if (comm.match.status !== MatchStatus.UNPLAYED || !comm.reschedule) continue;

    const requestedDate = new Date(comm.reschedule);
    if (Number.isNaN(requestedDate.getTime())) continue;

    const settled = await prisma.$transaction(async (tx) => {
      const updatedComm = await tx.matchComm.updateMany({
        where: {
          id: comm.id,
          rescheduleStatus: RESCHEDULE_STATUS_PENDING,
        },
        data: {
          rescheduleStatus: RESCHEDULE_STATUS_ACCEPTED,
        },
      });

      if (updatedComm.count === 0) {
        return false;
      }

      await tx.match.update({
        where: { id: comm.matchId },
        data: {
          matchDateTime: requestedDate,
        },
      });

      await tx.matchComm.create({
        data: {
          matchId: comm.matchId,
          owner: null,
          content: 'MATCH RESPONSE: Reschedule request automatically accepted after 24 hours.',
          createdAt: new Date(),
        },
      });

      return true;
    });

    if (!settled) continue;

    settledCount++;
    await logAudit({
      actorId: null,
      actorRole: null,
      category: AuditCategory.MATCH,
      action: AuditAction.MATCH_SCHEDULE_UPDATED,
      targetType: 'Match',
      targetId: String(comm.matchId),
      metadata: {
        rescheduleCommId: comm.id,
        matchDateTimeUtc: requestedDate.toISOString(),
        previousMatchDateTimeUtc: comm.match.matchDateTime?.toISOString() ?? null,
        matchTimezone: comm.match.matchTimezone,
        reason: 'reschedule_request_auto_accepted',
      },
    });
  }

  return settledCount;
}

/**
 * Get all match communications (messages and reschedules)
 */
export async function getMatchComms(matchId: number) {
  return await prisma.matchComm.findMany({
    where: { matchId },
    include: {
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Create a staff-action comment in a match's communication thread.
 * Attributed to the acting staff member's account (owner = steamId).
 */
export async function createAdminActionComm(
  matchId: number,
  actorSteamId: string,
  content: string,
) {
  return await prisma.matchComm.create({
    data: {
      matchId,
      owner: actorSteamId,
      content,
      createdAt: new Date(),
    },
  });
}

/**
 * Get a single match communication by ID
 */
export async function getMatchCommById(commId: number) {
  const comm = await prisma.matchComm.findUnique({
    where: { id: commId },
  });

  if (!comm) {
    notFound('Match communication not found');
  }

  return comm;
}
