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
      region: {
        select: {
          id: true,
          name: true,
        },
      },
      itemPayment: {
        include: { steamItem: true },
      },
      _count: {
        select: {
          teams: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });
}

/**
 * Get visible divisions only (for public use)
 * Ordered by ID descending to show highest divisions first
 * (INVITE -> PREMIER -> INTERMEDIATE -> OPEN -> NEWCOMER)
 * Includes regionId for filtering by region
 */
export async function getVisibleDivisions() {
  return await prisma.division.findMany({
    where: { hidden: 0 },
    select: {
      id: true,
      name: true,
      signupCost: true,
      regionId: true,
    },
    orderBy: { id: 'desc' },
  });
}

/**
 * Get divisions for filter UI (simplified)
 * Returns only id and name for visible divisions
 */
export async function getDivisionsForFilter() {
  return await prisma.division.findMany({
    where: { hidden: 0 },
    select: {
      id: true,
      name: true,
      regionId: true,
      region: {
        select: { name: true },
      },
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * Find the top-ranked visible division for a specific region.
 * Uses id DESC ordering which matches the existing convention
 * (higher id = lower division tier: INVITE > PREMIER > INTERMEDIATE > OPEN > NEWCOMER).
 * This avoids hardcoding a division name like "Premier" that may differ per region.
 */
export async function findTopDivisionByRegion(regionId: number) {
  return await prisma.division.findFirst({
    where: { regionId, hidden: 0 },
    orderBy: { id: 'desc' },
  });
}

/**
 * Create a new division
 *
 * Business logic validation:
 * - Division name must be unique within its region (case-insensitive)
 * - regionId is required
 */
export async function createDivision(data: { name: string; signupCost: number; regionId: number }) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Division name is required');
  }

  if (!data.regionId) {
    throw new Error('Region is required');
  }

  // Check if division already exists in this region (case-insensitive)
  const existingDivision = await prisma.division.findFirst({
    where: {
      name: { equals: trimmedName, mode: 'insensitive' },
      regionId: data.regionId,
    },
  });

  if (existingDivision) {
    throw new Error('Division with this name already exists in this region');
  }

  return await prisma.division.create({
    data: {
      name: trimmedName,
      signupCost: data.signupCost,
      regionId: data.regionId,
      hidden: 0,
    },
  });
}

/**
 * Update an existing division
 *
 * Business logic validation:
 * - Division must exist
 * - New name must not conflict with another division in the same region (case-insensitive)
 * - regionId is required
 */
export async function updateDivision(
  id: number,
  data: {
    name: string;
    signupCost: number;
    regionId: number;
  },
) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Division name is required');
  }

  if (!data.regionId) {
    throw new Error('Region is required');
  }

  // Check if division exists
  const division = await prisma.division.findUnique({ where: { id } });
  if (!division) {
    throw new Error('Division not found');
  }

  // Check for name conflicts within the target region (case-insensitive)
  const conflictingDivision = await prisma.division.findFirst({
    where: {
      name: { equals: trimmedName, mode: 'insensitive' },
      regionId: data.regionId,
      NOT: { id },
    },
  });

  if (conflictingDivision) {
    throw new Error('Division with this name already exists in this region');
  }

  return await prisma.division.update({
    where: { id },
    data: {
      name: trimmedName,
      signupCost: data.signupCost,
      regionId: data.regionId,
    },
  });
}

/**
 * Delete a division
 *
 * Business logic validation:
 * - Division must exist
 * - Cannot delete if any teams are assigned to it or any staff members are assigned to it
 */
export async function deleteDivision(id: number) {
  const division = await prisma.division.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          teams: true,
          staffAssignments: true,
        },
      },
    },
  });

  if (!division) {
    throw new Error('Division not found');
  }

  const blockers: string[] = [];
  if (division._count.teams > 0)
    blockers.push(`${division._count.teams} team${division._count.teams !== 1 ? 's' : ''}`);
  if (division._count.staffAssignments > 0)
    blockers.push(
      `${division._count.staffAssignments} staff member${division._count.staffAssignments !== 1 ? 's' : ''} assigned to it`,
    );

  if (blockers.length > 0) {
    throw new Error(`Cannot delete division: it has ${blockers.join(', ')}.`);
  }

  return await prisma.division.delete({ where: { id } });
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
    data: { hidden: division.hidden === 0 ? 1 : 0 },
  });
}
