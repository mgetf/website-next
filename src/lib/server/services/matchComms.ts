/**
 * Match Communications Service
 * Handles match messages and reschedule requests
 */

import { prisma } from '$lib/server/db';
import type { User, Match, MatchComm } from '$prisma/client.js';
import { MatchStatus, UserRole } from '$prisma/client.js';
import { error } from '@sveltejs/kit';

/**
 * Create a match communication (message or reschedule request)
 */
export async function createMatchComm(
	matchId: number,
	userId: string,
	content: string,
	rescheduleData?: {
		proposedDateTime: string;
	}
) {
	const match = await prisma.match.findUnique({
		where: { id: matchId }
	});

	if (!match) {
		throw error(404, 'Match not found');
	}

	const createdAt = Math.floor(Date.now() / 1000);

	const commData: any = {
		matchId,
		owner: userId,
		content,
		createdAt
	};

	if (rescheduleData) {
		commData.reschedule = rescheduleData.proposedDateTime;
		commData.rescheduleStatus = 0; // Pending
		commData.content = `RESCHEDULE REQUESTED: ${rescheduleData.proposedDateTime}`;
	}

	const comm = await prisma.matchComm.create({
		data: commData
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
			rescheduleStatus: 0 // Pending
		},
		include: {
			user: true
		},
		orderBy: {
			createdAt: 'desc'
		}
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
			rescheduleStatus: { not: null }
		},
		include: {
			user: true
		},
		orderBy: {
			createdAt: 'desc'
		}
	});
}

/**
 * Check if user can respond to a reschedule request
 * Only the opposing team owner or admins can respond
 * Requester can cancel their own request
 */
export function canRespondToReschedule(
	user: User | null,
	comm: MatchComm,
	match: Match & {
		homeTeam: { players: Array<{ playerSteamId: string; permissionLevel: number; active: number }> };
		awayTeam: { players: Array<{ playerSteamId: string; permissionLevel: number; active: number }> };
	},
	action: 'accept' | 'deny' | 'cancel'
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
	respondedBy: string
) {
	const comm = await prisma.matchComm.findUnique({
		where: { id: commId },
		include: {
			match: true
		}
	});

	if (!comm) {
		throw error(404, 'Reschedule request not found');
	}

	if (comm.rescheduleStatus !== 0) {
		throw error(400, 'Reschedule request already processed');
	}

	let newStatus: number;
	let responseMessage: string;

	if (status === 'accept') {
		newStatus = 1; // Accepted
		responseMessage = 'MATCH RESPONSE: Reschedule request accepted.';

		// Update match date/time
		if (comm.reschedule) {
			await prisma.match.update({
				where: { id: comm.matchId },
				data: {
					matchDateTime: new Date(comm.reschedule)
				}
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
			rescheduleStatus: newStatus
		}
	});

	// Create response message
	await prisma.matchComm.create({
		data: {
			matchId: comm.matchId,
			owner: respondedBy,
			content: responseMessage,
			createdAt: Math.floor(Date.now() / 1000)
		}
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

	const now = Math.floor(Date.now() / 1000);
	const deadline = comm.createdAt + 24 * 60 * 60; // 24 hours
	const secondsRemaining = deadline - now;

	if (secondsRemaining <= 0) {
		return { timeRemaining: '00:00:00', expired: true };
	}

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

/**
 * Get all match communications (messages and reschedules)
 */
export async function getMatchComms(matchId: number) {
	return await prisma.matchComm.findMany({
		where: { matchId },
		include: {
			user: true
		},
		orderBy: {
			createdAt: 'desc'
		}
	});
}

/**
 * Get a single match communication by ID
 */
export async function getMatchCommById(commId: number) {
	const comm = await prisma.matchComm.findUnique({
		where: { id: commId }
	});

	if (!comm) {
		throw error(404, 'Match communication not found');
	}

	return comm;
}

