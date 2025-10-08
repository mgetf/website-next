/**
 * Division Service
 * 
 * All division-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all divisions with their team counts
 * Includes hidden divisions (for admin use)
 */
export async function getDivisions() {
	return await prisma.division.findMany({
		include: {
			_count: {
				select: {
					teams: true
				}
			}
		},
		orderBy: {
			id: 'asc'
		}
	});
}

/**
 * Get visible divisions only (for public use)
 * Ordered by ID descending to show highest divisions first
 * (INVITE -> PREMIER -> INTERMEDIATE -> OPEN -> NEWCOMER)
 */
export async function getVisibleDivisions() {
	return await prisma.division.findMany({
		where: { hidden: 0 },
		orderBy: { id: 'desc' }
	});
}

/**
 * Get divisions for filter UI (simplified)
 * Returns only id and name for visible divisions
 */
export async function getDivisionsForFilter() {
	return await prisma.division.findMany({
		where: { hidden: 0 },
		select: { id: true, name: true },
		orderBy: { id: 'asc' }
	});
}

/**
 * Get a single division by ID
 */
export async function getDivisionById(id: number) {
	return await prisma.division.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					teams: true
				}
			}
		}
	});
}

/**
 * Find division by name (case-insensitive search)
 * Useful for keyword lookups like "premier"
 */
export async function findDivisionByName(name: string, onlyVisible = true) {
	return await prisma.division.findFirst({
		where: {
			name: {
				contains: name,
				mode: 'insensitive'
			},
			...(onlyVisible ? { hidden: 0 } : {})
		}
	});
}

/**
 * Create a new division
 * 
 * Business logic validation:
 * - Division name must be unique (case-insensitive)
 */
export async function createDivision(data: {
	name: string;
	signupCost: number;
}) {
	const trimmedName = data.name.trim();

	if (!trimmedName) {
		throw new Error('Division name is required');
	}

	// Check if division already exists (case-insensitive)
	const existingDivision = await prisma.division.findFirst({
		where: { name: { equals: trimmedName, mode: 'insensitive' } }
	});

	if (existingDivision) {
		throw new Error('Division with this name already exists');
	}

	return await prisma.division.create({
		data: {
			name: trimmedName,
			signupCost: data.signupCost,
			hidden: 0
		}
	});
}

/**
 * Update an existing division
 * 
 * Business logic validation:
 * - Division must exist
 * - New name must not conflict with another division (case-insensitive)
 */
export async function updateDivision(
	id: number,
	data: {
		name: string;
		signupCost: number;
	}
) {
	const trimmedName = data.name.trim();

	if (!trimmedName) {
		throw new Error('Division name is required');
	}

	// Check if division exists
	const division = await prisma.division.findUnique({ where: { id } });
	if (!division) {
		throw new Error('Division not found');
	}

	// Check for name conflicts (case-insensitive)
	const conflictingDivision = await prisma.division.findFirst({
		where: {
			name: { equals: trimmedName, mode: 'insensitive' },
			NOT: { id }
		}
	});

	if (conflictingDivision) {
		throw new Error('Division with this name already exists');
	}

	return await prisma.division.update({
		where: { id },
		data: {
			name: trimmedName,
			signupCost: data.signupCost
		}
	});
}

/**
 * Toggle division visibility (hidden/visible)
 */
export async function toggleDivisionVisibility(id: number) {
	const division = await prisma.division.findUnique({ where: { id } });
	
	if (!division) {
		throw new Error('Division not found');
	}

	return await prisma.division.update({
		where: { id },
		data: { hidden: division.hidden === 0 ? 1 : 0 }
	});
}

/**
 * Delete a division
 * 
 * Business logic validation:
 * - Division must exist
 * - Division must not have any teams
 */
export async function deleteDivision(id: number) {
	// Check if division exists
	const division = await prisma.division.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					teams: true
				}
			}
		}
	});

	if (!division) {
		throw new Error('Division not found');
	}

	// Check if division has teams
	if (division._count.teams > 0) {
		throw new Error(
			`Cannot delete division with ${division._count.teams} teams.`
		);
	}

	return await prisma.division.delete({
		where: { id }
	});
}

