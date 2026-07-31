/**
 * Notification Service
 *
 * All notification-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { NotificationType } from '$prisma/client.js';
import { notificationHub, buildNotifyPayload } from '$lib/server/realtime/notificationHub';
import type { NotificationPayload } from '$lib/server/realtime/notificationHub';

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
  try {
    const payload = buildNotifyPayload(notification);
    await prisma.$executeRawUnsafe(`SELECT pg_notify('notifications', $1)`, payload);
  } catch (err) {
    console.error(
      '[notificationHub] pg_notify failed (notification still saved):',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Get notifications for dropdown (unread + recent read, max 10)
 */
export async function getNotificationsForDropdown(userSteamId: string) {
  return await prisma.notification.findMany({
    where: {
      userSteamId,
    },
    include: {
      actor: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
    },
    orderBy: [
      { isRead: 'asc' }, // Unread first
      { createdAt: 'desc' },
    ],
    take: 10,
  });
}

/**
 * Get all notifications for a user (with optional limit and pagination)
 * Used for the full notifications page
 */
function stableNotifNumericId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

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
        actor: null,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows.slice(offset, offset + limit);
  }

  return await prisma.notification.findMany({
    where: {
      userSteamId,
    },
    include: {
      actor: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    skip: offset,
    take: limit,
  });
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

  const [unreadCount, totalCount] = await Promise.all([
    prisma.notification.count({
      where: { userSteamId, isRead: false },
    }),
    prisma.notification.count({
      where: { userSteamId },
    }),
  ]);

  return { unreadCount, totalCount };
}

/**
 * Mark a single notification as read
 * Security: Verifies the notification belongs to the user
 */
export async function markAsRead(notificationId: number, userSteamId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userSteamId: true },
  });

  if (!notification || notification.userSteamId !== userSteamId) {
    throw new Error('Notification not found or unauthorized');
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true },
  });
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

  await prisma.notification.updateMany({
    where: {
      userSteamId,
      isRead: false,
    },
    data: {
      isRead: true,
    },
  });
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
  if (data.length === 0) return;

  const created = await prisma.notification.createManyAndReturn({ data });
  const ids = created.map((n) => n.id);

  const enriched = await prisma.notification.findMany({
    where: { id: { in: ids } },
    include: { actor: { select: actorSelect } },
  });

  await Promise.all(
    enriched.map((n) =>
      emitNotify({
        id: n.id,
        userSteamId: n.userSteamId!,
        type: n.type,
        url: n.url,
        message: n.message,
        actorSteamId: n.actorSteamId,
        actor: n.actor
          ? {
              steamId: n.actor.steamId,
              steamUsername: n.actor.steamUsername,
              steamAvatar: n.actor.steamAvatar,
            }
          : null,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }),
    ),
  );
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
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      homeTeamId: true,
      awayTeamId: true,
    },
  });

  if (!match || !match.homeTeamId || !match.awayTeamId) {
    return;
  }

  const teamPlayers = await prisma.playerInTeam.findMany({
    where: {
      teamId: {
        in: [match.homeTeamId, match.awayTeamId],
      },
      active: 1,
    },
    select: {
      playerSteamId: true,
    },
  });

  const notificationsToInsert = teamPlayers
    .filter((player) => player.playerSteamId !== actorSteamId)
    .map((player) => ({
      userSteamId: player.playerSteamId,
      type: 'MATCH_COMM' as NotificationType,
      url: `/matches/${matchId}`,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    }));

  await createManyAndEmit(notificationsToInsert);
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

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true },
  });

  if (!team) {
    return;
  }

  const teamPlayers = await prisma.playerInTeam.findMany({
    where: {
      teamId,
      active: 1,
    },
    select: {
      playerSteamId: true,
    },
  });

  const notificationsToInsert = teamPlayers
    .filter((player) => player.playerSteamId !== actorSteamId)
    .map((player) => ({
      userSteamId: player.playerSteamId,
      type: 'PENDING_PLAYER' as NotificationType,
      url: `/teams/${teamId}`,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    }));

  await createManyAndEmit(notificationsToInsert);
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
  const teamOwners = await prisma.playerInTeam.findMany({
    where: {
      teamId: { in: teamIds },
      active: 1,
      permissionLevel: { gte: 1 }, // 1 = Admin, 2 = Owner
    },
    select: {
      playerSteamId: true,
    },
  });

  const uniqueSteamIds = [...new Set(teamOwners.map((p) => p.playerSteamId))];

  const notificationsToInsert = uniqueSteamIds
    .filter((steamId) => steamId !== actorSteamId)
    .map((steamId) => ({
      userSteamId: steamId,
      type,
      url,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    }));

  await createManyAndEmit(notificationsToInsert);
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

  const notification = await prisma.notification.create({
    data: {
      userSteamId: steamId,
      type,
      url,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    },
    include: { actor: { select: actorSelect } },
  });

  await emitNotify({
    id: notification.id,
    userSteamId: notification.userSteamId!,
    type: notification.type,
    url: notification.url,
    message: notification.message,
    actorSteamId: notification.actorSteamId,
    actor: notification.actor
      ? {
          steamId: notification.actor.steamId,
          steamUsername: notification.actor.steamUsername,
          steamAvatar: notification.actor.steamAvatar,
        }
      : null,
    isRead: notification.isRead,
    createdAt: notification.createdAt.toISOString(),
  });
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
  const admins = await prisma.user.findMany({
    where: {
      permissionLevel: 'ADMIN',
    },
    select: {
      steamId: true,
    },
  });

  const notificationsToInsert = admins
    .filter((admin) => admin.steamId !== actorSteamId)
    .map((admin) => ({
      userSteamId: admin.steamId,
      type,
      url,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    }));

  await createManyAndEmit(notificationsToInsert);
}

/**
 * Get the ID of the most recent notification for a user
 * Returns 0 if no notifications exist
 */
export async function getLatestNotificationId(userSteamId: string): Promise<number> {
  const latest = await prisma.notification.findFirst({
    where: { userSteamId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });
  return latest?.id ?? 0;
}

/**
 * Get all notifications for a user with an ID greater than sinceId.
 * Used by the SSE route for initial backfill and reconnect catch-up.
 */
export async function getNotificationsSinceId(userSteamId: string, sinceId: number) {
  return await prisma.notification.findMany({
    where: {
      userSteamId,
      id: { gt: sinceId },
    },
    include: {
      actor: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
        },
      },
    },
    orderBy: { id: 'asc' },
    take: 50,
  });
}
