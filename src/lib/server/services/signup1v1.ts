/**
 * 1v1 League Signup Service
 * Handles individual player signup for 1v1 leagues using 1-person teams
 * The team abstraction is completely hidden from users
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import { error } from '@sveltejs/kit';
import { getCurrentSignupSeasonIds, getSignupSeasonForRegion } from './signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';

interface Signup1v1Context {
	isLoggedIn: boolean;
	hasActive1v1Entry: boolean;
	signupClosed: boolean;
	user: {
		steamId: string;
		steamUsername: string;
		steamAvatar: string | null;
	} | null;
}

interface Signup1v1Data {
	ownerSteamId: string;
	regionId: number;
	divisionId: number;
}

/**
 * Get 1v1 signup context for a user
 * Now uses per-season settings instead of global
 */
export async function get1v1SignupContext(steamId: string | null): Promise<Signup1v1Context> {
	// Get current signup season IDs for 1v1 format
	const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

	// Get active signup seasons with their settings for 1v1 format
	const activeSignupSeasons = await prisma.activeSignupSeason.findMany({
		where: {
			formatId: FORMAT_1V1
		},
		include: {
			season: {
				select: {
					signupsOpen: true
				}
			}
		}
	});

	// Check if ANY active 1v1 signup season has signups open
	const anySignupsOpen = activeSignupSeasons.some(as => as.season.signupsOpen);

	let hasActive1v1Entry = false;
	let user = null;

	if (steamId) {
		// Get user info
		const userData = await prisma.user.findUnique({
			where: { steamId },
			select: {
				steamId: true,
				steamUsername: true,
				steamAvatar: true
			}
		});

		user = userData;

		// Check if user already has an active 1v1 entry for a current signup season
		const existing1v1Entry = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: steamId,
				active: 1,
				team: {
					formatId: FORMAT_1V1,
					seasonId: {
						in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1]
					}
				}
			}
		});

		hasActive1v1Entry = !!existing1v1Entry;
	}

	return {
		isLoggedIn: !!steamId,
		hasActive1v1Entry,
		signupClosed: !anySignupsOpen, // Inverted: signupsOpen=false means signupClosed=true
		user
	};
}

/**
 * Validate 1v1 signup data
 */
export async function validate1v1Signup(data: Signup1v1Data): Promise<void> {
	// Get current signup season IDs for 1v1 format
	const currentSignupSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

	// Check if user already has an active 1v1 entry for this season
	const existing1v1Entry = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: data.ownerSteamId,
			active: 1,
			team: {
				formatId: FORMAT_1V1,
				seasonId: {
					in: currentSignupSeasonIds.length > 0 ? currentSignupSeasonIds : [-1]
				}
			}
		}
	});

	if (existing1v1Entry) {
		throw error(400, 'You are already signed up for the 1v1 league this season');
	}

	// Validate division exists
	const division = await prisma.division.findUnique({
		where: { id: data.divisionId }
	});

	if (!division) {
		throw error(400, 'Invalid division selected');
	}

	// Validate region exists
	const region = await prisma.region.findUnique({
		where: { id: data.regionId }
	});

	if (!region) {
		throw error(400, 'Invalid region selected');
	}

	// Check if there's an active signup season for this region + 1v1 format
	const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);

	if (!seasonId) {
		throw error(400, 'No active 1v1 signup season for this region');
	}
}

/**
 * Sign up a player for the 1v1 league
 * Creates a 1-person "team" with the player's Steam name and avatar frozen at signup time
 */
export async function signup1v1(data: Signup1v1Data): Promise<number> {
	// Validate first
	await validate1v1Signup(data);

	// Get user info for freezing name/avatar
	const user = await prisma.user.findUnique({
		where: { steamId: data.ownerSteamId },
		select: {
			steamId: true,
			steamUsername: true,
			steamAvatar: true
		}
	});

	if (!user) {
		throw error(400, 'User not found');
	}

	// Get division to determine status and cost
	const division = await prisma.division.findUnique({
		where: { id: data.divisionId }
	});

	if (!division) {
		throw error(400, 'Invalid division selected');
	}

	// Get the signup season for this region + 1v1 format
	const seasonId = await getSignupSeasonForRegion(data.regionId, FORMAT_1V1);

	if (!seasonId) {
		throw error(400, 'No active 1v1 signup season for this region');
	}

	// Determine initial status based on division
	// Premier (4) and Intermediate (3) start as PLACEMENT, others as UNREADY
	const initialStatus =
		data.divisionId === 3 || data.divisionId === 4 ? TeamStatus.PLACEMENT : TeamStatus.UNREADY;

	// Create 1-person "team" with player's frozen name/avatar
	// No acronym, no join password (nobody can join a 1v1 entry)
	const team = await prisma.team.create({
		data: {
			name: user.steamUsername, // Frozen at signup time
			avatar: user.steamAvatar, // Frozen at signup time
			acronym: null,
			joinPassword: null, // No password - 1v1 entries can't be joined
			divisionId: data.divisionId,
			regionId: data.regionId,
			seasonId: seasonId,
			formatId: FORMAT_1V1,
			status: initialStatus,
			paymentStatus: division.signupCost === 0 ? 1 : 0
		}
	});

	// Check if user has already paid for this season
	const existingPayment = await prisma.paymentTracker.findUnique({
		where: {
			playerSteamId_seasonId: {
				playerSteamId: data.ownerSteamId,
				seasonId: seasonId
			}
		}
	});

	const amountPaid = existingPayment?.amount || 0;
	const isPaid = division.signupCost === 0 || amountPaid >= division.signupCost;

	// Add player as sole owner (permissionLevel = 2)
	await prisma.playerInTeam.create({
		data: {
			playerSteamId: data.ownerSteamId,
			teamId: team.id,
			permissionLevel: 2, // Owner
			paymentStatus: isPaid ? 1 : 0,
			active: 1
		}
	});

	return team.id;
}

/**
 * Get a user's active 1v1 entry (if any)
 * Used for profile display and navigation
 */
export async function getUserActive1v1Entry(steamId: string) {
	const currentSeasonIds = await getCurrentSignupSeasonIds(FORMAT_1V1);

	// First try current signup seasons
	if (currentSeasonIds.length > 0) {
		const currentEntry = await prisma.playerInTeam.findFirst({
			where: {
				playerSteamId: steamId,
				active: 1,
				team: {
					formatId: FORMAT_1V1,
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

		if (currentEntry) {
			return currentEntry.team;
		}
	}

	// Fall back to any active 1v1 entry
	const anyEntry = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				formatId: FORMAT_1V1
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
		},
		orderBy: {
			startedAt: 'desc'
		}
	});

	return anyEntry?.team || null;
}

/**
 * Get all 1v1 entries for a user (current and past)
 * Used for player profile history
 */
export async function getUser1v1History(steamId: string) {
	const entries = await prisma.playerInTeam.findMany({
		where: {
			playerSteamId: steamId,
			team: {
				formatId: FORMAT_1V1
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
		},
		orderBy: {
			startedAt: 'desc'
		}
	});

	return entries.map((e) => e.team);
}
