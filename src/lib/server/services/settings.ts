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
				leagueFees: data.leagueFees ?? 0
			}
		});
	}
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

// ============================================================================
// PER-SEASON SETTINGS
// These settings are now managed at the season level for better control
// ============================================================================

/**
 * Season settings interface
 */
export interface SeasonSettings {
	signupsOpen: boolean;
	rosterLocked: boolean;
	paymentRequired: boolean;
	matchWeek: number | null;
	matchDeadline: Date | null;
}

/**
 * Get settings for a specific season
 */
export async function getSeasonSettings(seasonId: number): Promise<SeasonSettings | null> {
	const season = await prisma.season.findUnique({
		where: { id: seasonId },
		select: {
			signupsOpen: true,
			rosterLocked: true,
			paymentRequired: true,
			matchWeek: true,
			matchDeadline: true
		}
	});

	return season;
}

/**
 * Update settings for a specific season
 */
export async function updateSeasonSettings(
	seasonId: number,
	data: Partial<SeasonSettings>
) {
	return await prisma.season.update({
		where: { id: seasonId },
		data
	});
}

/**
 * Toggle signups open status for a season
 */
export async function toggleSeasonSignupsOpen(seasonId: number) {
	const season = await prisma.season.findUnique({
		where: { id: seasonId },
		select: { signupsOpen: true }
	});

	if (!season) {
		throw new Error('Season not found');
	}

	return await prisma.season.update({
		where: { id: seasonId },
		data: { signupsOpen: !season.signupsOpen }
	});
}

/**
 * Toggle roster locked status for a season
 */
export async function toggleSeasonRosterLocked(seasonId: number) {
	const season = await prisma.season.findUnique({
		where: { id: seasonId },
		select: { rosterLocked: true }
	});

	if (!season) {
		throw new Error('Season not found');
	}

	return await prisma.season.update({
		where: { id: seasonId },
		data: { rosterLocked: !season.rosterLocked }
	});
}

/**
 * Toggle payment required status for a season
 */
export async function toggleSeasonPaymentRequired(seasonId: number) {
	const season = await prisma.season.findUnique({
		where: { id: seasonId },
		select: { paymentRequired: true }
	});

	if (!season) {
		throw new Error('Season not found');
	}

	return await prisma.season.update({
		where: { id: seasonId },
		data: { paymentRequired: !season.paymentRequired }
	});
}

/**
 * Get season settings by team ID
 * Useful for checking roster lock when editing a team
 */
export async function getSeasonSettingsByTeamId(teamId: number): Promise<SeasonSettings | null> {
	const team = await prisma.team.findUnique({
		where: { id: teamId },
		select: {
			season: {
				select: {
					signupsOpen: true,
					rosterLocked: true,
					paymentRequired: true,
					matchWeek: true,
					matchDeadline: true
				}
			}
		}
	});

	return team?.season ?? null;
}

/**
 * Check if any active signup season has signups open
 * Useful for navigation to determine if signup button should show
 */
export async function hasAnySignupsOpen(): Promise<boolean> {
	const activeSeasons = await prisma.activeSignupSeason.findMany({
		include: {
			season: {
				select: { signupsOpen: true }
			}
		}
	});

	return activeSeasons.some(as => as.season.signupsOpen);
}
