/**
 * Notification Service
 *
 * All notification-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { NotificationType } from '$prisma/client.js';

/**
 * Get all unread notifications for a user (with actor info)
 */
export async function getUnreadNotifications(userSteamId: string) {
  return await prisma.notification.findMany({
    where: {
      userSteamId,
      isRead: false,
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
    orderBy: {
      createdAt: 'desc',
    },
    take: 50,
  });
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
    orderBy: {
      createdAt: 'desc',
    },
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
 * Delete a notification
 * Security: Verifies the notification belongs to the user
 */
export async function deleteNotification(notificationId: number, userSteamId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { userSteamId: true },
  });

  if (!notification || notification.userSteamId !== userSteamId) {
    throw new Error('Notification not found or unauthorized');
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  });
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

  if (notificationsToInsert.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToInsert,
    });
  }
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

  if (notificationsToInsert.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToInsert,
    });
  }
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

  if (notificationsToInsert.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToInsert,
    });
  }
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
  await prisma.notification.create({
    data: {
      userSteamId: steamId,
      type,
      url,
      message,
      actorSteamId: actorSteamId || null,
      isRead: false,
    },
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

  if (notificationsToInsert.length > 0) {
    await prisma.notification.createMany({
      data: notificationsToInsert,
    });
  }
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
 * Get all notifications for a user with an ID greater than sinceId
 * Used for SSE polling to fetch only new notifications
 */
export async function getNotificationsSinceId(userSteamId: string, sinceId: number) {
  return await prisma.notification.findMany({
    where: {
      userSteamId,
      id: { gt: sinceId },
    },
    orderBy: { id: 'asc' },
  });
}
