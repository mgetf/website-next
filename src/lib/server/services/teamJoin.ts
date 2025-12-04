/**
 * Team Join Service
 * Handles team joining via token and password
 */

import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { validateJoinToken } from './teamSignup';

/**
 * Get current signup season IDs from global settings
 */
async function getCurrentSignupSeasonIds(): Promise<number[]> {
	const global = await prisma.global.findFirst();
	if (!global) return [];
	
	return [
		global.naSignupSeasonId,
		global.euSignupSeasonId,
		global.ausSignupSeasonId,
		global.saSignupSeasonId,
		global.asiaSignupSeasonId
	].filter((id): id is number => id !== null);
}

interface TeamJoinInfo {
	team: any;
	activePlayers: any[];
	canJoin: boolean;
	error?: string;
}

/**
 * Validate join token and get team info
 */
export async function validateTokenAndGetTeam(token: string, steamId?: string): Promise<TeamJoinInfo> {
	// Decode and validate token
	const { teamId } = validateJoinToken(token);

	// Get team info
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: {
			division: true,
			region: true,
			season: true,
			players: {
				where: { active: 1 },
				include: {
					player: true
				}
			}
		}
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	const activePlayers = team.players;

	// Check if user is trying to join their own team
	if (steamId) {
		const isTeamMember = activePlayers.some(p => p.playerSteamId === steamId && p.permissionLevel >= 0);
		if (isTeamMember) {
			return {
				team,
				activePlayers,
				canJoin: false,
				error: 'You cannot invite yourself to your own team'
			};
		}
	}

	// Check if team is full
	if (activePlayers.length >= 3) {
		return {
			team,
			activePlayers,
			canJoin: false,
			error: 'Team is full (maximum 3 players)'
		};
	}

	return {
		team,
		activePlayers,
		canJoin: true
	};
}

/**
 * Validate join password
 */
export async function validateJoinPassword(teamId: number, password: string): Promise<boolean> {
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		select: { joinPassword: true }
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	return team.joinPassword === password;
}

/**
 * Request to join team by password (creates pending player)
 */
export async function requestJoinByPassword(
	teamId: number,
	steamId: string,
	password: string
): Promise<void> {
	// Validate password
	const isValid = await validateJoinPassword(teamId, password);
	if (!isValid) {
		throw error(400, 'Incorrect team password');
	}

	// Check if team exists and is not 1v1
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: {
			players: {
				where: { active: 1 }
			}
		}
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	if (team.is1v1 === 1) {
		throw error(400, 'Cannot join 1v1 teams');
	}

	// Check if user is trying to join their own team
	const isTeamMember = team.players.some(p => p.playerSteamId === steamId && p.permissionLevel >= 0);
	if (isTeamMember) {
		throw error(400, 'You cannot invite yourself to your own team');
	}

	// Check if user is already in another 2v2 team for the CURRENT signup season
	// (allows joining teams in new seasons if only active in old season teams)
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	const playerInOtherTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				is1v1: 0,
				seasonId: {
					in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1]
				}
			}
		}
	});

	if (playerInOtherTeam) {
		throw error(400, 'You are already in another 2v2 team for this season');
	}

	// Check if already has pending request
	const existingPending = await prisma.pendingPlayer.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		}
	});

	if (existingPending) {
		throw error(400, 'You already have a pending request for this team');
	}

	// Create pending player
	await prisma.pendingPlayer.create({
		data: {
			playerSteamId: steamId,
			teamId,
			status: 0
		}
	});
}

/**
 * Accept invite by token (automatically adds to roster)
 */
export async function acceptInviteByToken(token: string, steamId: string): Promise<number> {
	// Validate token and get team
	const { teamId } = validateJoinToken(token);

	// Get team info
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: {
			division: true,
			players: {
				where: { active: 1 }
			}
		}
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	// Check if team is 1v1
	if (team.is1v1 === 1) {
		throw error(400, 'Cannot join 1v1 teams');
	}

	// Check if user is trying to join their own team
	const isTeamMember = team.players.some(p => p.playerSteamId === steamId && p.permissionLevel >= 0);
	if (isTeamMember) {
		throw error(400, 'You cannot invite yourself to your own team');
	}

	// Check roster size
	if (team.players.length >= 3) {
		throw error(400, 'Team is full (maximum 3 players)');
	}

	// Check if user is already in another 2v2 team for the CURRENT signup season
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	const playerInOtherTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				is1v1: 0,
				seasonId: {
					in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1]
				}
			}
		}
	});

	if (playerInOtherTeam) {
		throw error(400, 'You are already in another 2v2 team for this season');
	}

	// Check if already in this team
	const existingMember = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		}
	});

	if (existingMember && existingMember.active === 1) {
		throw error(400, 'You are already in this team');
	}

	const paymentStatus = team.division?.signupCost === 0 ? 1 : 0;

	// Add player to team
	await prisma.playerInTeam.upsert({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		},
		create: {
			playerSteamId: steamId,
			teamId,
			permissionLevel: 0,
			active: 1,
			paymentStatus
		},
		update: {
			active: 1,
			permissionLevel: 0,
			paymentStatus,
			startedAt: new Date()
		}
	});

	// Remove any pending player record
	await prisma.pendingPlayer.deleteMany({
		where: {
			playerSteamId: steamId,
			teamId
		}
	});

	return teamId;
}

/**
 * Get user's pending invitations
 */
export async function getUserPendingInvites(steamId: string) {
	const pendingInvites = await prisma.pendingPlayer.findMany({
		where: {
			playerSteamId: steamId,
			status: 0
		},
		include: {
			team: {
				include: {
					division: true,
					region: true,
					season: true,
					players: {
						where: { active: 1 }
					}
				}
			}
		}
	});

	return pendingInvites;
}

/**
 * Check if a player is in a specific team
 */
export async function isPlayerInTeam(steamId: string, teamId: number): Promise<boolean> {
	const playerInTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			teamId,
			active: 1,
			permissionLevel: {
				gte: 0
			}
		}
	});

	return !!playerInTeam;
}

/**
 * Check if a player is in any active 2v2 team for the current signup season
 * (allows being in old season teams)
 */
export async function isPlayerInAnyActiveTeam(steamId: string): Promise<boolean> {
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	const playerInOtherTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				is1v1: 0,
				seasonId: {
					in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1]
				}
			}
		}
	});

	return !!playerInOtherTeam;
}

/**
 * Decline/delete pending invitation
 */
export async function declineInvitation(steamId: string, teamId: number): Promise<void> {
	await prisma.pendingPlayer.deleteMany({
		where: {
			playerSteamId: steamId,
			teamId
		}
	});
}


