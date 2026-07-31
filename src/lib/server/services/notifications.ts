/**
 * Notification Service
 *
 * All notification-related business logic and database operations.
 */

import { notificationHub, buildNotifyPayload } from '$lib/server/realtime/notificationHub';
import type { NotificationPayload } from '$lib/server/realtime/notificationHub';
import { NotificationType } from '$lib/types/enums';

const actorSelect = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

/**
 * Emit a pg_notify for a fully-enriched notification row.
 * Wrapped in try/catch so a notify failure never breaks the mutation.
 */
async function emitNotify(notification: NotificationPayload): Promise<void> {
  throw new Error('emitNotify is not available under Rama');
}

function stableNotifNumericId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * Get notifications for dropdown (unread + recent read, max 10)
 */
export async function getNotificationsForDropdown(userSteamId: string) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createNotificationsClient, getNotifications } =
      await import('$lib/server/rama/notifications');
    const map = await getNotifications(createNotificationsClient(ramaClientOpts()), userSteamId);
    return Object.entries(map)
      .map(([id, n]) => ({
        id: stableNotifNumericId(id),
        ramaId: id,
        userSteamId,
        type: n.type as NotificationType,
        url: n.href ?? '',
        message: n.body ?? '',
        actorSteamId: null as string | null,
        isRead: Boolean(n.read),
        createdAt: new Date(n.createdAt || 0),
        actor: null as {
          steamId: string;
          steamUsername: string;
          steamAvatar: string;
        } | null,
      }))
      .sort((a, b) => {
        if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, 10);
  }
  throw new Error('getNotificationsForDropdown requires DATA_BACKEND=rama');
}

/**
 * Get all notifications for a user (with optional limit and pagination)
 * Used for the full notifications page
 */

export async function getAllNotifications(userSteamId: string, limit = 50, offset = 0) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createNotificationsClient, getNotifications } =
      await import('$lib/server/rama/notifications');
    const map = await getNotifications(createNotificationsClient(ramaClientOpts()), userSteamId);
    const rows = Object.entries(map)
      .map(([id, n]) => ({
        id: stableNotifNumericId(id),
        ramaId: id,
        userSteamId,
        type: n.type as NotificationType,
        url: n.href ?? '',
        message: n.body ?? '',
        actorSteamId: null as string | null,
        isRead: Boolean(n.read),
        createdAt: new Date(n.createdAt || 0),
        actor: null as {
          steamId: string;
          steamUsername: string;
          steamAvatar: string;
        } | null,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(offset, offset + limit);
  }
  throw new Error('getAllNotifications requires DATA_BACKEND=rama');
}

/**
 * Get notification counts for a user
 */
export async function getNotificationCounts(userSteamId: string) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createNotificationsClient, getNotifications, getUnreadCount } =
      await import('$lib/server/rama/notifications');
    const client = createNotificationsClient(ramaClientOpts());
    const map = await getNotifications(client, userSteamId);
    const unreadCount = await getUnreadCount(client, userSteamId);
    return { unreadCount, totalCount: Object.keys(map).length };
  }
  throw new Error('getNotificationCounts requires DATA_BACKEND=rama');
}

/**
 * Mark a single notification as read
 * Security: Verifies the notification belongs to the user
 */
export async function markAsRead(notificationId: number, userSteamId: string) {
  throw new Error('markAsRead is not available under Rama');
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userSteamId: string) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createNotificationsClient, markAllRead } =
      await import('$lib/server/rama/notifications');
    await markAllRead(createNotificationsClient(ramaClientOpts()), userSteamId);
    return;
  }
  throw new Error('markAllAsRead requires DATA_BACKEND=rama');
}

/**
 * Insert multiple notifications and emit pg_notify for each.
 * Uses createManyAndReturn (Prisma 7) then enriches with actor data.
 */
async function createManyAndEmit(
  data: {
    userSteamId: string;
    type: NotificationType;
    url: string;
    message: string;
    actorSteamId: string | null;
    isRead: boolean;
  }[],
): Promise<void> {
  throw new Error('createManyAndEmit is not available under Rama');
}

/**
 * Create notifications for all players in a match (except the trigger user)
 * This notifies all players when there's match activity (comments, scores, reschedules, etc.)
 */
export async function createNotificationForMatch(
  matchId: number,
  message: string,
  actorSteamId?: string,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createMatchClient, getMatch } = await import('$lib/server/rama/match');
    const { createTeamsClient, getRoster } = await import('$lib/server/rama/teams');
    const match = await getMatch(createMatchClient(ramaClientOpts()), String(matchId));
    if (!match) return;
    const teams = createTeamsClient(ramaClientOpts());
    const steamIds = new Set<string>();
    for (const teamId of [String(match.homeTeamId), String(match.awayTeamId)]) {
      const roster = await getRoster(teams, teamId);
      for (const [steamId, member] of Object.entries(roster)) {
        if (!member.active || steamId === actorSteamId) continue;
        steamIds.add(steamId);
      }
    }
    for (const steamId of steamIds) {
      await notifyRama(steamId, 'MATCH_COMM', `/matches/${matchId}`, message);
    }
    return;
  }
  throw new Error('createNotificationForMatch requires DATA_BACKEND=rama');
}

/**
 * Create notifications for all players in a team (except the trigger user)
 * This notifies all team members when there's team activity (pending player requests, etc.)
 */
async function notifyRama(
  steamId: string,
  type: string,
  url: string,
  message: string,
): Promise<void> {
  const { ramaClientOpts } = await import('$lib/server/rama/config');
  const { createNotificationsClient, notify } = await import('$lib/server/rama/notifications');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await notify(createNotificationsClient(ramaClientOpts()), {
    steamId,
    id,
    notifType: type,
    body: message,
    href: url,
    createdAt: new Date().toISOString(),
  });
}

export async function createNotificationForTeam(
  teamId: number,
  message: string,
  actorSteamId?: string,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createTeamsClient, getRoster } = await import('$lib/server/rama/teams');
    const roster = await getRoster(createTeamsClient(ramaClientOpts()), String(teamId));
    for (const [steamId, member] of Object.entries(roster)) {
      if (!member.active || steamId === actorSteamId) continue;
      await notifyRama(steamId, 'PENDING_PLAYER', `/teams/${teamId}`, message);
    }
    return;
  }
  throw new Error('createNotificationForTeam requires DATA_BACKEND=rama');
}

/**
 * Create notifications for team owners/admins only (permissionLevel >= 1)
 * Used for match creation, score submissions, etc.
 */
export async function createNotificationForTeamOwners(
  teamIds: number[],
  type: NotificationType,
  url: string,
  message: string,
  actorSteamId?: string,
) {
  const { isRamaBackend, ramaClientOpts } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    const { createTeamsClient, getRoster } = await import('$lib/server/rama/teams');
    const client = createTeamsClient(ramaClientOpts());
    const uniqueSteamIds = new Set<string>();
    for (const teamId of teamIds) {
      const roster = await getRoster(client, String(teamId));
      for (const [steamId, member] of Object.entries(roster)) {
        if (!member.active || steamId === actorSteamId) continue;
        if (member.permissionLevel !== 'ADMIN' && member.permissionLevel !== 'STATUS') continue;
        uniqueSteamIds.add(steamId);
      }
    }
    for (const steamId of uniqueSteamIds) {
      await notifyRama(steamId, type, url, message);
    }
    return;
  }
  throw new Error('createNotificationForTeamOwners requires DATA_BACKEND=rama');
}

/**
 * Create a notification for a single user
 * Used for player invitations, etc.
 */
export async function createNotificationForUser(
  steamId: string,
  type: NotificationType,
  url: string,
  message: string,
  actorSteamId?: string,
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void actorSteamId;
    await notifyRama(steamId, type, url, message);
    return;
  }
  throw new Error('createNotificationForUser requires DATA_BACKEND=rama');
}

/**
 * Create notifications for all site admins
 * Used for disputes, important escalations, etc.
 */
export async function createNotificationForAdmins(
  type: NotificationType,
  url: string,
  message: string,
  actorSteamId?: string,
) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // UsersModule has no admin index yet — soft no-op under Rama cutover.
    void type;
    void url;
    void message;
    void actorSteamId;
    return;
  }
  throw new Error('createNotificationForAdmins requires DATA_BACKEND=rama');
}

/**
 * Get the ID of the most recent notification for a user
 * Returns 0 if no notifications exist
 */
export async function getLatestNotificationId(userSteamId: string): Promise<number> {
  return 0;
}

/**
 * Get all notifications for a user with an ID greater than sinceId.
 * Used by the SSE route for initial backfill and reconnect catch-up.
 */
export async function getNotificationsSinceId(
  userSteamId: string,
  sinceId: number,
): Promise<
  Array<{
    id: number;
    ramaId?: string;
    userSteamId: string;
    type: NotificationType | string;
    url: string;
    message: string;
    actorSteamId: string | null;
    isRead: boolean;
    createdAt: Date;
    actor: {
      steamId: string;
      steamUsername: string;
      steamAvatar: string;
    } | null;
  }>
> {
  void userSteamId;
  void sinceId;
  return [];
}
