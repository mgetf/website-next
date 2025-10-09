/**
 * Season Service
 * 
 * All season-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import type { Prisma } from '@prisma/client';

/**
 * Get all seasons with their region and team/match counts
 * Ordered by season number descending (most recent first)
 */
export async function getSeasons() {
	return await prisma.season.findMany({
		include: {
			region: true,
			_count: {
				select: {
					teams: true,
					matches: true
				}
			}
		},
		orderBy: {
			seasonNum: 'desc'
		}
	});
}

/**
 * Get a single season by ID
 */
export async function getSeasonById(id: number) {
	return await prisma.season.findUnique({
		where: { id },
		include: {
			region: true,
			_count: {
				select: {
					teams: true,
					matches: true
				}
			}
		}
	});
}

/**
 * Get the current (most recent) season
 */
export async function getCurrentSeason() {
	return await prisma.season.findFirst({
		orderBy: { seasonNum: 'desc' },
		include: { region: true }
	});
}

/**
 * Create a new season
 * 
 * Business logic validation:
 * - Season number must be unique per region
 */
export async function createSeason(data: {
	seasonNum: number;
	regionId: number;
	numWeeks: number;
}) {
	// Check if season already exists
	const existingSeason = await prisma.season.findFirst({
		where: {
			seasonNum: data.seasonNum,
			regionId: data.regionId
		}
	});

	if (existingSeason) {
		throw new Error(`Season ${data.seasonNum} already exists for this region`);
	}

	return await prisma.season.create({
		data: {
			seasonNum: data.seasonNum,
			regionId: data.regionId,
			numWeeks: data.numWeeks
		}
	});
}

/**
 * Update an existing season
 * 
 * Business logic validation:
 * - Season must exist
 * - New season number must not conflict with another season in the same region
 */
export async function updateSeason(
	id: number,
	data: {
		seasonNum: number;
		regionId: number;
		numWeeks: number;
	}
) {
	// Check if season exists
	const season = await prisma.season.findUnique({
		where: { id }
	});

	if (!season) {
		throw new Error('Season not found');
	}

	// Check if changing to a season number that already exists for this region
	const conflictingSeason = await prisma.season.findFirst({
		where: {
			seasonNum: data.seasonNum,
			regionId: data.regionId,
			NOT: { id }
		}
	});

	if (conflictingSeason) {
		throw new Error(`Season ${data.seasonNum} already exists for this region`);
	}

	return await prisma.season.update({
		where: { id },
		data: {
			seasonNum: data.seasonNum,
			regionId: data.regionId,
			numWeeks: data.numWeeks
		}
	});
}

/**
 * Delete a season
 * 
 * Business logic validation:
 * - Season must exist
 * - Season must not have any teams or matches
 */
export async function deleteSeason(id: number) {
	// Check if season exists
	const season = await prisma.season.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					teams: true,
					matches: true
				}
			}
		}
	});

	if (!season) {
		throw new Error('Season not found');
	}

	// Check if season has teams or matches
	if (season._count.teams > 0 || season._count.matches > 0) {
		throw new Error(
			`Cannot delete season with ${season._count.teams} teams and ${season._count.matches} matches. Remove all teams and matches first.`
		);
	}

	return await prisma.season.delete({
		where: { id }
	});
}

/**
 * Get seasons for dropdown/filter UI (simplified)
 * Returns id, seasonNum, and region info for disambiguation
 * 
 * TODO: TEMPORARY WORKAROUND - Remove region info from filter when schema is refactored
 * Currently seasons have the same seasonNum across different regions (e.g., "Season 1 NA" and "Season 1 EU" both have seasonNum=1)
 * This causes confusion in dropdowns where multiple "Season 1" options appear.
 * 
 * FUTURE SCHEMA FIX:
 * - Make season names unique and descriptive (e.g., "Season 1 - NA", "Season 1 - EU")
 * - OR create a proper Season/SeasonInstance relationship where Season is the global concept and SeasonInstance is region-specific
 * - OR add a composite display name field that includes region context
 * 
 * Once schema is fixed, this function should return to simple { id, seasonNum } structure
 */
export async function getSeasonsForFilter(limit = 50) {
	return await prisma.season.findMany({
		select: { 
			id: true, 
			seasonNum: true,
			regionId: true,
			region: {
				select: {
					id: true,
					name: true
				}
			}
		},
		orderBy: [
			{ seasonNum: 'desc' },
			{ regionId: 'asc' }
		],
		take: limit
	});
}

/**
 * Transform season data for UI display
 * Calculates status based on teams and matches
 */
export function transformSeasonForUI(
	season: Prisma.SeasonGetPayload<{
		include: {
			region: true;
			_count: {
				select: {
					teams: true;
					matches: true;
				};
			};
		};
	}>,
	isLatest: boolean
) {
	let status = 'Completed';
	if (isLatest && season._count.teams > 0) {
		status = 'Active';
	} else if (season._count.teams === 0) {
		status = 'Draft';
	}

	return {
		id: season.id,
		seasonNum: season.seasonNum,
		region: season.region.name,
		regionId: season.regionId,
		numWeeks: season.numWeeks,
		teams: season._count.teams,
		matches: season._count.matches,
		status
	};
}

