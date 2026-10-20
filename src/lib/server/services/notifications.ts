/**
 * Notification Service
 *
 * All notification-related business logic and database operations.
 */

import { prisma } from '#lib/server/db.js';
import type { NotificationType } from '#prisma/client.js';
import { notificationHub, buildNotifyPayload } from '#lib/server/realtime/notificationHub.js';
import type { NotificationPayload } from '#lib/server/realtime/notificationHub.js';
import { deliverBrowserPush, deliverBrowserPushBatch } from '#lib/server/services/browserPush.js';

const actorSelect = {
  steamId: true,
  steamUsername: true,
  steamAvatar: true,
} as const;

/**
 * Emit a pg_notify for a fully-enriched notification row.
 * Wrapped in try/catch so a notify failure never breaks the mutation.
 */
async function emitNotify(
  notification: NotificationPayload,
  options?: { push?: boolean },
): Promise<void> {
  try {
    const payload = buildNotifyPayload(notification);
    await prisma.$executeRawUnsafe(`SELECT pg_notify('notifications', $1)`, payload);
  } catch (err) {
    console.error(
      '[notificationHub] pg_notify failed (notification still saved):',
      err instanceof Error ? err.message : err,
    );
  }

  if (options?.push === false) return;

  void deliverBrowserPush({
    id: notification.id,
    userSteamId: notification.userSteamId,
    type: notification.type,
    url: notification.url,
    message: notification.message,
  });
}

const INSERT_CHUNK = 500;
const NOTIFY_CONCURRENCY = 20;

async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const current = next;
      next += 1;
      const item = items[current];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
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
export async function getAllNotifications(userSteamId: string, limit = 50, offset = 0) {
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
export async function createNotificationForTeam(
  teamId: number,
  message: string,
  actorSteamId?: string,
) {
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
 * Unique Steam IDs from a roster query, excluding the actor when provided.
 * Callers decide who is in `players` (active-only, owners-only, etc.).
 */
export function uniqueRosterSteamIds(
  players: Array<{ playerSteamId: string }>,
  actorSteamId?: string,
): string[] {
  return [...new Set(players.map((p) => p.playerSteamId))].filter(
    (steamId) => steamId !== actorSteamId,
  );
}

/**
 * Create notifications for every active roster member on the given teams.
 * Used for match creation and bye weeks so regular members are not left out.
 */
export async function createNotificationForRoster(
  teamIds: number[],
  type: NotificationType,
  url: string,
  message: string,
  actorSteamId?: string,
) {
  if (teamIds.length === 0) return;

  const teamPlayers = await prisma.playerInTeam.findMany({
    where: {
      teamId: { in: teamIds },
      active: 1,
    },
    select: {
      playerSteamId: true,
    },
  });

  const notificationsToInsert = uniqueRosterSteamIds(teamPlayers, actorSteamId).map((steamId) => ({
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
 * Create notifications for team leaders and co-leaders only (permissionLevel >= 1)
 * Used for score submissions, disputes, etc.
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
      permissionLevel: { gte: 1 }, // 1 = Co-leader, 2 = Leader
    },
    select: {
      playerSteamId: true,
    },
  });

  const notificationsToInsert = uniqueRosterSteamIds(teamOwners, actorSteamId).map((steamId) => ({
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
 * One bell row per account, except the person who triggered it.
 * Used for site-wide notices such as a new rulebook revision.
 * Returns how many accounts were notified.
 */
export async function createNotificationForAllUsers(
  type: NotificationType,
  url: string,
  message: string,
  actorSteamId?: string,
): Promise<number> {
  const users = await prisma.user.findMany({
    where: actorSteamId ? { steamId: { not: actorSteamId } } : undefined,
    select: { steamId: true },
  });
  if (users.length === 0) return 0;

  const actor = actorSteamId
    ? await prisma.user.findUnique({
        where: { steamId: actorSteamId },
        select: actorSelect,
      })
    : null;

  const created: NotificationPayload[] = [];

  for (let offset = 0; offset < users.length; offset += INSERT_CHUNK) {
    const chunk = users.slice(offset, offset + INSERT_CHUNK);
    const rows = await prisma.notification.createManyAndReturn({
      data: chunk.map((user) => ({
        userSteamId: user.steamId,
        type,
        url,
        message,
        actorSteamId: actorSteamId || null,
        isRead: false,
      })),
    });

    for (const row of rows) {
      if (!row.userSteamId) continue;
      created.push({
        id: row.id,
        userSteamId: row.userSteamId,
        type: row.type,
        url: row.url,
        message: row.message,
        actorSteamId: row.actorSteamId,
        actor: actor
          ? {
              steamId: actor.steamId,
              steamUsername: actor.steamUsername,
              steamAvatar: actor.steamAvatar,
            }
          : null,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
      });
    }
  }

  try {
    await runPool(created, NOTIFY_CONCURRENCY, (notification) =>
      emitNotify(notification, { push: false }),
    );
    await deliverBrowserPushBatch(
      created.map((notification) => ({
        id: notification.id,
        userSteamId: notification.userSteamId,
        type: notification.type,
        url: notification.url,
        message: notification.message,
      })),
    );
  } catch (err) {
    console.error(
      '[notifications] saved the global notice, but live delivery failed:',
      err instanceof Error ? err.message : err,
    );
  }

  return created.length;
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
