/**
 * Match Communications Service
 * Handles match messages and reschedule requests
 */

import { notFound, badRequest } from '$lib/server/utils/errors';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { MatchStatus, UserRole } from '$lib/types/enums';

type MatchComm = {
  id: number;
  matchId: number;
  content: string;
  owner?: string | null;
  reschedule?: string | number | null;
  rescheduleStatus?: number | null;
  rescheduleTime?: Date | null;
  rescheduleTz?: string | null;
  createdAt?: Date;
};

type Match = {
  id: number;
  status: string;
  [key: string]: unknown;
};

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

  return (
    formatRescheduleDateTime(comm.rescheduleTime, fallbackTimeZone) ??
    (comm.rescheduleTime ? String(comm.rescheduleTime) : '')
  );
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
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch, nextCommId, postComm, requestReschedule } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const match = await getMatch(client, String(matchId));
    if (!match) notFound('Match not found');

    const commId = nextCommId();
    const createdAt = new Date();
    if (rescheduleData) {
      const display =
        formatRescheduleDateTime(
          rescheduleData.proposedDateTime,
          rescheduleData.proposedTimezone,
        ) ?? rescheduleData.proposedDateTime;
      const body = `${RESCHEDULE_REQUEST_PREFIX} ${display}`;
      const proposedUtc = new Date(rescheduleData.proposedDateTime);
      const ack = await requestReschedule(client, {
        matchId: String(matchId),
        commId,
        owner: userId,
        content: body,
        reschedule: Number.isNaN(proposedUtc.getTime())
          ? rescheduleData.proposedDateTime
          : proposedUtc.toISOString(),
        createdAt: createdAt.toISOString(),
      });
      if (!ack.ok) badRequest(ack.error || 'Failed to request reschedule');
      return {
        id: Number.parseInt(commId, 10) || Date.now(),
        matchId,
        owner: userId,
        content: body,
        createdAt,
        reschedule: rescheduleData.proposedDateTime,
        rescheduleStatus: RESCHEDULE_STATUS_PENDING,
      };
    }

    const ack = await postComm(client, {
      matchId: String(matchId),
      commId,
      owner: userId,
      content,
      createdAt: createdAt.toISOString(),
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to post message');
    return {
      id: Number.parseInt(commId, 10) || Date.now(),
      matchId,
      owner: userId,
      content,
      createdAt,
      reschedule: null,
      rescheduleStatus: null,
    };
  }
  throw new Error('createMatchComm requires DATA_BACKEND=rama');
}

/**
 * Get pending reschedule request for a match
 */
export async function getPendingReschedule(matchId: number) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatchComm, getPendingRescheduleCommId } =
      await import('$lib/server/rama/match');
    const { createUsersClient, getUser } = await import('$lib/server/rama/users');
    const client = createMatchClient(ramaClientOpts());
    const commId = await getPendingRescheduleCommId(client, String(matchId));
    if (!commId) return null;
    const row = await getMatchComm(client, String(matchId), commId);
    if (!row) return null;
    const user = await getUser(createUsersClient(ramaClientOpts()), row.owner);
    const numericId = Number.parseInt(commId, 10);
    return {
      id: Number.isFinite(numericId) ? numericId : Date.now(),
      matchId,
      owner: row.owner || null,
      content: row.content,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      reschedule: row.reschedule || null,
      rescheduleStatus: Number(row.rescheduleStatus ?? 0),
      user: user
        ? {
            steamId: row.owner,
            steamUsername: String(user.username ?? row.owner),
            steamAvatar: String(user.avatarUrl ?? ''),
          }
        : null,
    };
  }
  throw new Error('getPendingReschedule requires DATA_BACKEND=rama');
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
  matchIdHint?: number,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    if (matchIdHint == null) badRequest('Match id required for Rama reschedule response');
    const { createMatchClient, getPendingRescheduleCommId, nextCommId, respondReschedule } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const pendingId = await getPendingRescheduleCommId(client, String(matchIdHint));
    if (!pendingId) notFound('Reschedule request not found');

    let responseMessage: string;
    let newStatus: number;
    if (status === 'accept') {
      newStatus = RESCHEDULE_STATUS_ACCEPTED;
      responseMessage = 'MATCH RESPONSE: Reschedule request accepted.';
    } else if (status === 'deny') {
      newStatus = 2;
      responseMessage = 'MATCH RESPONSE: Reschedule request denied.';
    } else {
      newStatus = 3;
      responseMessage = 'MATCH RESPONSE: Reschedule request canceled.';
    }

    const ack = await respondReschedule(client, {
      matchId: String(matchIdHint),
      commId: pendingId,
      response: status,
      respondedBy,
      responseCommId: nextCommId(),
      responseContent: responseMessage,
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to respond to reschedule');
    void commId;
    return { newStatus, responseMessage };
  }
  throw new Error('updateRescheduleStatus requires DATA_BACKEND=rama');
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
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void matchId;
    return 0;
  }
  throw new Error('settleExpiredReschedules requires DATA_BACKEND=rama');
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
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, nextCommId, postComm } = await import('$lib/server/rama/match');
    const createdAt = new Date();
    const commId = nextCommId();
    const ack = await postComm(createMatchClient(ramaClientOpts()), {
      matchId: String(matchId),
      commId,
      owner: actorSteamId,
      content,
      createdAt: createdAt.toISOString(),
    });
    if (!ack.ok) badRequest(ack.error || 'Failed to post admin note');
    return {
      id: Number.parseInt(commId, 10) || Date.now(),
      matchId,
      owner: actorSteamId,
      content,
      createdAt,
      reschedule: null,
      rescheduleStatus: null,
    };
  }
  throw new Error('createAdminActionComm requires DATA_BACKEND=rama');
}

/**
 * Get a single match communication by ID
 */
export async function getMatchCommById(commId: number, matchIdHint?: number) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    if (matchIdHint == null) notFound('Match communication not found');
    const { createMatchClient, getMatchComm, getPendingRescheduleCommId } =
      await import('$lib/server/rama/match');
    const client = createMatchClient(ramaClientOpts());
    const pendingId = await getPendingRescheduleCommId(client, String(matchIdHint));
    const key = pendingId ?? String(commId);
    const row = await getMatchComm(client, String(matchIdHint), key);
    if (!row) notFound('Match communication not found');
    const numericId = Number.parseInt(key, 10);
    return {
      id: Number.isFinite(numericId) ? numericId : commId,
      matchId: matchIdHint,
      owner: row.owner || null,
      content: row.content,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      reschedule: row.reschedule || null,
      rescheduleStatus:
        row.rescheduleStatus == null || Number(row.rescheduleStatus) < 0
          ? null
          : Number(row.rescheduleStatus),
    };
  }
  throw new Error('getMatchCommById requires DATA_BACKEND=rama');
}
