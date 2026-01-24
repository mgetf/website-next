/**
 * Team Management Service
 * Handles team editing, roster management, and player approvals
 */

import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { uploadToR2, saveTempFile, deleteTempFile, validateUploadedFile } from '../utils/r2Upload';
import path from 'path';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_2V2 } from '$lib/server/constants/formats';

interface TeamEditData {
	team: any;
	players: any[];
	pendingPlayers: any[];
	deniedPlayers: any[];
	rosterLocked: boolean;
	isOwner: boolean;
	isAdmin: boolean;
}

/**
 * Get team data for editing
 * Now uses per-season roster lock instead of global
 */
export async function getTeamForEdit(teamId: number, steamId: string): Promise<TeamEditData> {
	// Load team with all relations, including season settings
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: {
			division: true,
			region: true,
			season: {
				select: {
					id: true,
					seasonNum: true,
					numWeeks: true,
					regionId: true,
					formatId: true,
					signupsOpen: true,
					rosterLocked: true,
					paymentRequired: true,
					matchWeek: true,
					matchDeadline: true
				}
			},
			players: {
				include: {
					player: true
				},
				orderBy: {
					permissionLevel: 'desc'
				}
			},
			pendingPlayers: {
				where: {
					status: 0 // Pending
				},
				include: {
					player: true
				}
			},
			deniedPlayers: {
				include: {
					player: true
				},
				orderBy: {
					deniedAt: 'desc'
				},
				take: 10 // Last 10 denied players
			}
		}
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	// Check user's permission in the team
	const userInTeam = team.players.find((p) => p.playerSteamId === steamId);
	const isOwner = userInTeam?.permissionLevel === 2;
	const isAdmin = userInTeam?.permissionLevel === 1 || isOwner;

	// Get roster lock status from team's season (per-season setting)
	const rosterLocked = team.season?.rosterLocked ?? false;

	return {
		team,
		players: team.players,
		pendingPlayers: team.pendingPlayers,
		deniedPlayers: team.deniedPlayers,
		rosterLocked,
		isOwner,
		isAdmin
	};
}

/**
 * Update team info (name, acronym, password)
 */
export async function updateTeamInfo(
	teamId: number,
	data: { name?: string; acronym?: string; joinPassword?: string }
): Promise<void> {
	// Validate name if provided
	if (data.name) {
		if (data.name.length > 25) {
			throw error(400, 'Team name must be 25 characters or less');
		}
		if (/<|>/.test(data.name)) {
			throw error(400, 'Team name cannot contain < or > characters');
		}

		// Check for duplicate
		const duplicate = await prisma.team.findFirst({
			where: {
				name: data.name,
				NOT: { id: teamId }
			}
		});

		if (duplicate) {
			throw error(400, 'A team with this name already exists');
		}

		// Get old team name for history
		const oldTeam = await prisma.team.findUnique({
			where: { id: teamId },
			select: { name: true }
		});

		if (oldTeam && oldTeam.name !== data.name) {
			// Add to name history
			await prisma.teamNameHistory.create({
				data: {
					teamId,
					name: data.name
				}
			});
		}
	}

	// Validate acronym if provided
	if (data.acronym && data.acronym.length > 4) {
		throw error(400, 'Team acronym must be 4 characters or less');
	}

	// Update team
	await prisma.team.update({
		where: { id: teamId },
		data: {
			...(data.name && { name: data.name }),
			...(data.acronym !== undefined && { acronym: data.acronym }),
			...(data.joinPassword && { joinPassword: data.joinPassword })
		}
	});
}

/**
 * Upload team avatar
 */
export async function uploadTeamAvatar(teamId: number, file: File): Promise<string | null> {
	// Validate file
	validateUploadedFile(file);

	// Save temporarily
	const tempFilePath = await saveTempFile(file);

	try {
		// Upload to R2 (returns null if R2 not configured)
		const ext = path.extname(file.name);
		const remotePath = `team-avatars/${Date.now()}${ext}`;
		const avatarUrl = await uploadToR2(tempFilePath, remotePath);

		// Only update team if upload succeeded
		if (avatarUrl) {
			await prisma.team.update({
				where: { id: teamId },
				data: { avatar: avatarUrl }
			});
		} else {
			console.warn('Avatar upload skipped - R2 not configured');
		}

		// Delete temp file
		deleteTempFile(tempFilePath);

		return avatarUrl;
	} catch (err) {
		// Clean up temp file on error
		deleteTempFile(tempFilePath);
		throw err;
	}
}

/**
 * Remove player from team
 */
export async function removePlayer(teamId: number, playerSteamId: string): Promise<void> {
	// Check player is not owner
	const player = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		}
	});

	if (!player) {
		throw error(404, 'Player not found in team');
	}

	if (player.permissionLevel === 2) {
		throw error(400, 'Cannot remove team owner');
	}

	// Set player as inactive
	await prisma.playerInTeam.update({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		},
		data: {
			active: 0,
			permissionLevel: -2,
			leftAt: new Date()
		}
	});
}

/**
 * Promote player (increase permission level)
 */
export async function promotePlayer(teamId: number, playerSteamId: string): Promise<void> {
	const player = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		}
	});

	if (!player || player.active !== 1) {
		throw error(404, 'Player not found in team');
	}

	// Can only promote from 0 to 1 (Member to Admin)
	if (player.permissionLevel >= 1) {
		throw error(400, 'Player already has maximum promotion level');
	}

	await prisma.playerInTeam.update({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		},
		data: {
			permissionLevel: player.permissionLevel + 1
		}
	});
}

/**
 * Demote player (decrease permission level)
 */
export async function demotePlayer(teamId: number, playerSteamId: string): Promise<void> {
	const player = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		}
	});

	if (!player || player.active !== 1) {
		throw error(404, 'Player not found in team');
	}

	// Can only demote from 1 to 0 (Admin to Member)
	if (player.permissionLevel <= 0) {
		throw error(400, 'Player already has minimum permission level');
	}

	if (player.permissionLevel === 2) {
		throw error(400, 'Cannot demote team owner');
	}

	await prisma.playerInTeam.update({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		},
		data: {
			permissionLevel: player.permissionLevel - 1
		}
	});
}

/**
 * Invite player by Steam ID
 */
export async function invitePlayerBySteamId(teamId: number, steamId: string): Promise<void> {
	// Check if user exists
	const user = await prisma.user.findUnique({
		where: { steamId }
	});

	if (!user) {
		throw error(404, 'User with this Steam ID not found');
	}

	// Check if already in team
	const existingMember = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		}
	});

	if (existingMember && existingMember.active === 1) {
		throw error(400, 'Player is already in this team');
	}

	// Check if already has pending invite
	const existingPending = await prisma.pendingPlayer.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		}
	});

	if (existingPending) {
		throw error(400, 'Player already has a pending invitation');
	}

	// Create pending player record
	await prisma.pendingPlayer.create({
		data: {
			playerSteamId: steamId,
			teamId,
			status: 0 // Pending
		}
	});

	// TODO: Send notification to player
}

/**
 * Approve pending player
 */
export async function approvePlayer(teamId: number, playerSteamId: string): Promise<void> {
	// Check roster size (max 3 active players)
	const activePlayersCount = await prisma.playerInTeam.count({
		where: {
			teamId,
			active: 1
		}
	});

	if (activePlayersCount >= 3) {
		throw error(400, 'Team is full (maximum 3 players)');
	}

	// Check if player is in another 2v2 team for the CURRENT signup season
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	const playerInOtherTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId,
			active: 1,
			team: {
				formatId: FORMAT_2V2,
				seasonId: {
					in: currentSeasonIds.length > 0 ? currentSeasonIds : [-1]
				}
			}
		}
	});

	if (playerInOtherTeam) {
		throw error(400, 'Player is already in another 2v2 team for this season');
	}

	// Get team info for payment status
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: { division: true, season: true }
	});

	if (!team) {
		throw error(404, 'Team not found');
	}

	const paymentStatus = team.division?.signupCost === 0 ? 1 : 0;

	// Add player to team
	await prisma.playerInTeam.upsert({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		},
		create: {
			playerSteamId,
			teamId,
			permissionLevel: 0, // Member
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

	// Remove from pending
	await prisma.pendingPlayer.delete({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		}
	});

	// Create notification for admins
	const admins = await prisma.user.findMany({
		where: {
			permissionLevel: 'ADMIN'
		}
	});

	for (const admin of admins) {
		await prisma.notification.create({
			data: {
				userSteamId: admin.steamId,
				type: 'PENDING_PLAYER',
				url: '/admin'
			}
		});
	}
}

/**
 * Decline pending player
 */
export async function declinePlayer(teamId: number, playerSteamId: string): Promise<void> {
	// Delete from pending
	await prisma.pendingPlayer.delete({
		where: {
			playerSteamId_teamId: {
				playerSteamId,
				teamId
			}
		}
	});
}

/**
 * Disband team (mark as DEAD and deactivate all players)
 */
export async function disbandTeam(teamId: number): Promise<void> {
	// Mark team as DEAD
	await prisma.team.update({
		where: { id: teamId },
		data: {
			status: 'DEAD'
		}
	});

	// Deactivate all players in the team
	await prisma.playerInTeam.updateMany({
		where: { 
			teamId,
			active: 1 
		},
		data: {
			active: 0,
			permissionLevel: -2,
			leftAt: new Date()
		}
	});

	// Delete all pending players (they don't need to be kept)
	await prisma.pendingPlayer.deleteMany({
		where: { teamId }
	});
}

