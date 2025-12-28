/**
 * Region Service
 * 
 * All region-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';

/**
 * Get all regions with their season and team counts
 * Includes hidden regions (for admin use)
 */
export async function getRegions() {
	return await prisma.region.findMany({
		include: {
			_count: {
				select: {
					seasons: true,
					teams: true
				}
			}
		},
		orderBy: {
			name: 'asc'
		}
	});
}

/**
 * Get visible regions only (for public/filter use)
 * Includes currencySymbol for displaying prices
 */
export async function getVisibleRegions() {
	return await prisma.region.findMany({
		where: { hidden: 0 },
		select: {
			id: true,
			name: true,
			currencySymbol: true
		},
		orderBy: { id: 'asc' }
	});
}

/**
 * Get regions for filter UI (simplified)
 * Returns only id and name for visible regions
 */
export async function getRegionsForFilter() {
	return await prisma.region.findMany({
		select: { id: true, name: true },
		where: { hidden: 0 },
		orderBy: { id: 'asc' }
	});
}

/**
 * Get a single region by ID
 */
export async function getRegionById(id: number) {
	return await prisma.region.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					seasons: true,
					teams: true
				}
			}
		}
	});
}

/**
 * Create a new region
 * 
 * Business logic validation:
 * - Region name must be unique (case-insensitive)
 */
export async function createRegion(name: string) {
	const trimmedName = name.trim();

	if (!trimmedName) {
		throw new Error('Region name is required');
	}

	// Check if region already exists (case-insensitive)
	const existingRegion = await prisma.region.findFirst({
		where: { name: { equals: trimmedName, mode: 'insensitive' } }
	});

	if (existingRegion) {
		throw new Error('Region with this name already exists');
	}

	return await prisma.region.create({
		data: { name: trimmedName, hidden: 0 }
	});
}

/**
 * Update an existing region
 * 
 * Business logic validation:
 * - Region must exist
 * - New name must not conflict with another region (case-insensitive)
 */
export async function updateRegion(id: number, name: string) {
	const trimmedName = name.trim();

	if (!trimmedName) {
		throw new Error('Region name is required');
	}

	// Check if region exists
	const region = await prisma.region.findUnique({ where: { id } });
	if (!region) {
		throw new Error('Region not found');
	}

	// Check for name conflicts (case-insensitive)
	const conflictingRegion = await prisma.region.findFirst({
		where: {
			name: { equals: trimmedName, mode: 'insensitive' },
			NOT: { id }
		}
	});

	if (conflictingRegion) {
		throw new Error('Region with this name already exists');
	}

	return await prisma.region.update({
		where: { id },
		data: { name: trimmedName }
	});
}

/**
 * Toggle region visibility (hidden/visible)
 */
export async function toggleRegionVisibility(id: number) {
	const region = await prisma.region.findUnique({ where: { id } });
	
	if (!region) {
		throw new Error('Region not found');
	}

	return await prisma.region.update({
		where: { id },
		data: { hidden: region.hidden === 0 ? 1 : 0 }
	});
}

