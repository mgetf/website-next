/**
 * Settings Service
 * 
 * All global settings and configuration business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get global settings
 * There should only be one row in the global table
 */
export async function getGlobalSettings() {
	return await prisma.global.findFirst({
		include: {
			naSignupSeason: {
				select: {
					id: true,
					seasonNum: true,
					region: {
						select: {
							id: true,
							name: true
						}
					}
				}
			},
			euSignupSeason: {
				select: {
					id: true,
					seasonNum: true,
					region: {
						select: {
							id: true,
							name: true
						}
					}
				}
			},
			ausSignupSeason: {
				select: {
					id: true,
					seasonNum: true,
					region: {
						select: {
							id: true,
							name: true
						}
					}
				}
			},
			saSignupSeason: {
				select: {
					id: true,
					seasonNum: true,
					region: {
						select: {
							id: true,
							name: true
						}
					}
				}
			},
			asiaSignupSeason: {
				select: {
					id: true,
					seasonNum: true,
					region: {
						select: {
							id: true,
							name: true
						}
					}
				}
			}
		}
	});
}

/**
 * Update global settings
 * Creates if doesn't exist
 */
export async function updateGlobalSettings(data: {
	leagueFees?: number;
	signupClosed?: number;
	rosterLocked?: number;
	paymentRequired?: number;
	naSignupSeasonId?: number | null;
	euSignupSeasonId?: number | null;
	ausSignupSeasonId?: number | null;
	saSignupSeasonId?: number | null;
	asiaSignupSeasonId?: number | null;
}) {
	// Get existing settings
	const existingSettings = await prisma.global.findFirst();

	if (existingSettings) {
		// Update existing
		return await prisma.global.update({
			where: { id: existingSettings.id },
			data
		});
	} else {
		// Create new
		return await prisma.global.create({
			data: {
				leagueFees: data.leagueFees ?? 0,
				signupClosed: data.signupClosed ?? 0,
				rosterLocked: data.rosterLocked ?? 0,
				paymentRequired: data.paymentRequired ?? 0,
				naSignupSeasonId: data.naSignupSeasonId,
				euSignupSeasonId: data.euSignupSeasonId,
				ausSignupSeasonId: data.ausSignupSeasonId,
				saSignupSeasonId: data.saSignupSeasonId,
				asiaSignupSeasonId: data.asiaSignupSeasonId
			}
		});
	}
}

/**
 * Toggle signup closed status
 */
export async function toggleSignupClosed() {
	const settings = await prisma.global.findFirst();

	if (!settings) {
		throw new Error('Global settings not found');
	}

	return await prisma.global.update({
		where: { id: settings.id },
		data: {
			signupClosed: settings.signupClosed === 1 ? 0 : 1
		}
	});
}

/**
 * Toggle roster locked status
 */
export async function toggleRosterLocked() {
	const settings = await prisma.global.findFirst();

	if (!settings) {
		throw new Error('Global settings not found');
	}

	return await prisma.global.update({
		where: { id: settings.id },
		data: {
			rosterLocked: settings.rosterLocked === 1 ? 0 : 1
		}
	});
}

/**
 * Toggle payment required status
 */
export async function togglePaymentRequired() {
	const settings = await prisma.global.findFirst();

	if (!settings) {
		throw new Error('Global settings not found');
	}

	return await prisma.global.update({
		where: { id: settings.id },
		data: {
			paymentRequired: settings.paymentRequired === 1 ? 0 : 1
		}
	});
}

/**
 * Set signup season for a region
 */
export async function setRegionSignupSeason(region: 'NA' | 'EU' | 'AUS' | 'SA' | 'ASIA', seasonId: number | null) {
	const settings = await prisma.global.findFirst();

	if (!settings) {
		throw new Error('Global settings not found');
	}

	const fieldMap = {
		NA: 'naSignupSeasonId',
		EU: 'euSignupSeasonId',
		AUS: 'ausSignupSeasonId',
		SA: 'saSignupSeasonId',
		ASIA: 'asiaSignupSeasonId'
	};

	return await prisma.global.update({
		where: { id: settings.id },
		data: {
			[fieldMap[region]]: seasonId
		}
	});
}

