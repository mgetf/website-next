/**
 * Notification Service
 * 
 * All notification-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { NotificationType } from '@prisma/client';

/**
 * Get all unread notifications for a user
 */
export async function getUnreadNotifications(userSteamId: string) {
	return await prisma.notification.findMany({
		where: {
			userSteamId,
			isRead: false
		},
		orderBy: {
			createdAt: 'desc'
		},
		take: 50
	});
}

/**
 * Get all notifications for a user (with optional limit)
 */
export async function getAllNotifications(userSteamId: string, limit = 50) {
	return await prisma.notification.findMany({
		where: {
			userSteamId
		},
		orderBy: {
			createdAt: 'desc'
		},
		take: limit
	});
}

/**
 * Mark a single notification as read
 * Security: Verifies the notification belongs to the user
 */
export async function markAsRead(notificationId: number, userSteamId: string) {
	const notification = await prisma.notification.findUnique({
		where: { id: notificationId },
		select: { userSteamId: true }
	});

	if (!notification || notification.userSteamId !== userSteamId) {
		throw new Error('Notification not found or unauthorized');
	}

	await prisma.notification.update({
		where: { id: notificationId },
		data: { isRead: true }
	});
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userSteamId: string) {
	await prisma.notification.updateMany({
		where: {
			userSteamId,
			isRead: false
		},
		data: {
			isRead: true
		}
	});
}

/**
 * Delete a notification
 * Security: Verifies the notification belongs to the user
 */
export async function deleteNotification(notificationId: number, userSteamId: string) {
	const notification = await prisma.notification.findUnique({
		where: { id: notificationId },
		select: { userSteamId: true }
	});

	if (!notification || notification.userSteamId !== userSteamId) {
		throw new Error('Notification not found or unauthorized');
	}

	await prisma.notification.delete({
		where: { id: notificationId }
	});
}

/**
 * Create notifications for all players in a match (except the trigger user)
 * This notifies all players when there's match activity (comments, scores, reschedules, etc.)
 */
export async function createNotificationForMatch(
	matchId: number,
	excludeUserSteamId?: string
) {
	const match = await prisma.match.findUnique({
		where: { id: matchId },
		select: {
			id: true,
			homeTeamId: true,
			awayTeamId: true
		}
	});

	if (!match || !match.homeTeamId || !match.awayTeamId) {
		return;
	}

	const teamPlayers = await prisma.playersInTeams.findMany({
		where: {
			teamId: {
				in: [match.homeTeamId, match.awayTeamId]
			},
			active: true
		},
		select: {
			playerSteamId: true
		}
	});

	const notificationsToInsert = teamPlayers
		.filter((player) => player.playerSteamId !== excludeUserSteamId)
		.map((player) => ({
			userSteamId: player.playerSteamId,
			type: 'MATCH_COMM' as NotificationType,
			url: `/matches/${matchId}`,
			isRead: false
		}));

	if (notificationsToInsert.length > 0) {
		await prisma.notification.createMany({
			data: notificationsToInsert
		});
	}
}

/**
 * Create notifications for all players in a team (except the trigger user)
 * This notifies all team members when there's team activity (pending player requests, etc.)
 */
export async function createNotificationForTeam(
	teamId: number,
	excludeUserSteamId?: string
) {
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		select: { id: true }
	});

	if (!team) {
		return;
	}

	const teamPlayers = await prisma.playersInTeams.findMany({
		where: {
			teamId,
			active: true
		},
		select: {
			playerSteamId: true
		}
	});

	const notificationsToInsert = teamPlayers
		.filter((player) => player.playerSteamId !== excludeUserSteamId)
		.map((player) => ({
			userSteamId: player.playerSteamId,
			type: 'PENDING_PLAYER' as NotificationType,
			url: `/teams/${teamId}`,
			isRead: false
		}));

	if (notificationsToInsert.length > 0) {
		await prisma.notification.createMany({
			data: notificationsToInsert
		});
	}
}

