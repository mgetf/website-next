/**
 * Payment Service
 * 
 * All payment-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';

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

/**
 * Get user's active 2v2 team for checkout
 * Prioritizes teams in current signup seasons (most likely to need payment)
 */
export async function getUserActiveTeamForCheckout(steamId: string) {
	const currentSeasonIds = await getCurrentSignupSeasonIds();
	
	// First, try to find a team in the current signup season
	if (currentSeasonIds.length > 0) {
		const currentSeasonTeam = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: steamId,
				active: 1,
				team: {
					is1v1: 0,
					seasonId: {
						in: currentSeasonIds
					}
				}
			},
			include: {
				team: {
					include: {
						division: true,
						region: true,
						season: true
					}
				}
			}
		});
		
		if (currentSeasonTeam) {
			return currentSeasonTeam;
		}
	}
	
	// Fall back to any active team
	const playerInTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				is1v1: 0
			}
		},
		include: {
			team: {
				include: {
					division: true,
					region: true,
					season: true
				}
			}
		}
	});

	return playerInTeam;
}

/**
 * Get existing payment for a season
 */
export async function getExistingPayment(steamId: string, seasonId: number) {
	return await prisma.paymentTracker.findUnique({
		where: {
			playerSteamId_seasonId: {
				playerSteamId: steamId,
				seasonId
			}
		}
	});
}

/**
 * Update player's payment status in team roster
 */
export async function updatePlayerPaymentStatus(steamId: string, teamId: number) {
	return await prisma.playerInTeam.update({
		where: {
			playerSteamId_teamId: {
				playerSteamId: steamId,
				teamId
			}
		},
		data: { paymentStatus: 1 }
	});
}

/**
 * Get league fees from global settings
 */
export async function getLeagueFees(): Promise<number> {
	const global = await prisma.global.findFirst();
	return global?.leagueFees ?? 0;
}

/**
 * Check if division requires payment and if user has paid
 * Returns payment information for redirect decision
 * 
 * Payment logic (matching old website):
 * - First-time payer: totalCost = signupCost + leagueFees
 * - Has existing payment: totalCost = signupCost only (league fees already paid)
 */
export async function checkPaymentRequired(options: {
	divisionId: number;
	steamId: string;
	seasonId: number | undefined;
}): Promise<{
	required: boolean;
	alreadyPaid: boolean;
	amountPaid: number;
	signupCost: number;
	leagueFees: number;
	totalCost: number;
	isFirstPayment: boolean;
}> {
	const { divisionId, steamId, seasonId } = options;

	const [division, leagueFees] = await Promise.all([
		prisma.division.findUnique({ where: { id: divisionId } }),
		getLeagueFees()
	]);

	if (!division) {
		throw error(404, 'Division not found');
	}

	// Free division - no payment required
	if (division.signupCost === 0) {
		return {
			required: false,
			alreadyPaid: true,
			amountPaid: 0,
			signupCost: 0,
			leagueFees: 0,
			totalCost: 0,
			isFirstPayment: false
		};
	}

	// No season ID - payment required but can't check existing payments
	if (!seasonId) {
		return {
			required: true,
			alreadyPaid: false,
			amountPaid: 0,
			signupCost: division.signupCost,
			leagueFees,
			totalCost: division.signupCost + leagueFees,
			isFirstPayment: true
		};
	}

	const existingPayment = await getExistingPayment(steamId, seasonId);
	const amountPaid = existingPayment?.amount || 0;
	const isFirstPayment = amountPaid === 0;
	
	// First-time payers pay signupCost + leagueFees
	// Returning payers only pay remaining signupCost (league fees already paid)
	const totalCost = isFirstPayment 
		? division.signupCost + leagueFees 
		: division.signupCost;
	
	const alreadyPaid = amountPaid >= totalCost;

	return {
		required: true,
		alreadyPaid,
		amountPaid,
		signupCost: division.signupCost,
		leagueFees: isFirstPayment ? leagueFees : 0,
		totalCost,
		isFirstPayment
	};
}

