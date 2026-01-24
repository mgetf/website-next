/**
 * Settings Service
 * 
 * All global settings and configuration business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { setActiveSignupSeason, getAllActiveSignupSeasons } from './signupSeasons';

/**
 * Get global settings
 * There should only be one row in the global table
 */
export async function getGlobalSettings() {
	return await prisma.global.findFirst();
}

/**
 * Get global settings with active signup seasons
 * Returns global settings plus the active signup seasons from the junction table
 */
export async function getGlobalSettingsWithSignupSeasons() {
	const [global, activeSignupSeasons] = await Promise.all([
		prisma.global.findFirst(),
		getAllActiveSignupSeasons()
	]);

	return {
		...global,
		activeSignupSeasons
	};
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
	matchCreationDeadline?: Date | null;
	currentMatchWeek?: number | null;
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
				matchCreationDeadline: data.matchCreationDeadline,
				currentMatchWeek: data.currentMatchWeek
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
 * Update signup season for a region+format combination
 * Uses the ActiveSignupSeason junction table
 */
export async function updateRegionSignupSeason(
	regionId: number,
	formatId: number,
	seasonId: number | null
) {
	return await setActiveSignupSeason(regionId, formatId, seasonId);
}
