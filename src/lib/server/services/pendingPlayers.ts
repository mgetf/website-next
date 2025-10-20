/**
 * Pending Players Service
 * 
 * All pending player approval/denial business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all pending player requests with related data
 */
export async function getPendingPlayers() {
	return await prisma.pendingPlayer.findMany({
		include: {
			player: {
				select: { 
					steamId: true, 
					steamUsername: true, 
					steamAvatar: true 
				}
			},
			team: {
				select: {
					id: true,
					name: true,
					seasonId: true,
					divisionId: true,
					division: { 
						select: { 
							id: true,
							name: true,
							signupCost: true
						} 
					}
				}
			}
		},
		orderBy: {
			playerSteamId: 'asc'
		}
	});
}

/**
 * Approve a pending player and add them to the team
 */
export async function approvePlayer(playerSteamId: string, teamId: number) {
	// Get team info for payment check
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		include: { 
			division: {
				select: {
					signupCost: true
				}
			}
		}
	});
	
	if (!team?.seasonId || !team?.divisionId) {
		throw new Error('Team missing season or division');
	}
	
	// Check existing payment for this season
	const payment = await prisma.paymentTracker.findUnique({
		where: {
			playerSteamId_seasonId: {
				playerSteamId,
				seasonId: team.seasonId
			}
		}
	});
	
	const amountPaid = payment?.amount || 0;
	const signupCost = team.division?.signupCost || 0;
	const paymentStatus = amountPaid >= signupCost ? 1 : 0;
	
	// Use transaction to ensure atomicity
	await prisma.$transaction(async (tx) => {
		// Add player to team
		await tx.playerInTeam.create({
			data: {
				playerSteamId,
				teamId,
				active: 1,
				permissionLevel: 0, // 0 = MEMBER
				paymentStatus
			}
		});
		
		// Remove from pending
		await tx.pendingPlayer.delete({
			where: {
				playerSteamId_teamId: { 
					playerSteamId, 
					teamId 
				}
			}
		});
		
		// Update team payment status (paid if at least 2 players have paid)
		const paidPlayersCount = await tx.playerInTeam.count({
			where: { 
				teamId, 
				active: 1, 
				paymentStatus: 1 
			}
		});
		
		await tx.team.update({
			where: { id: teamId },
			data: { 
				paymentStatus: paidPlayersCount >= 2 ? 1 : 0 // 1 = PAID, 0 = UNPAID
			}
		});
	});
}

/**
 * Decline a pending player request with a reason
 */
export async function declinePlayer(
	playerSteamId: string,
	teamId: number,
	reason: string,
	adminSteamId: string
) {
	await prisma.$transaction(async (tx) => {
		// Add to denied players list
		await tx.deniedPlayer.create({
			data: {
				playerSteamId,
				teamId,
				reason,
				adminId: adminSteamId
			}
		});
		
		// Remove from pending
		await tx.pendingPlayer.delete({
			where: {
				playerSteamId_teamId: { 
					playerSteamId, 
					teamId 
				}
			}
		});
	});
}

