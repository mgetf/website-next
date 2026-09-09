/**
 * Division Service
 *
 * All division-related business logic and database operations.
 * Divisions are scoped to a region and a format.
 */

import { prisma } from '$lib/server/db';
import { upsertDivisionItemPayment } from '$lib/server/services/division-item-payments';

export type DivisionItemPaymentInput = {
  steamItemId: number;
  itemQuantity: number;
};

export type DivisionScope = {
  regionId: number;
  formatId: number;
};

export type DivisionBulkResult = {
  created: number;
  skipped: number;
};

const SCOPE_TOKEN = /^(\d+):(\d+)$/;

function uniquePositiveInts(ids: number[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function parseScopeToken(token: string): DivisionScope | null {
  const match = SCOPE_TOKEN.exec(token);
  if (!match) return null;
  const regionId = Number(match[1]);
  const formatId = Number(match[2]);
  if (!Number.isInteger(regionId) || !Number.isInteger(formatId) || regionId < 1 || formatId < 1) {
    return null;
  }
  return { regionId, formatId };
}

export function parseDivisionScopeTokens(tokens: string[]): DivisionScope[] {
  const seen = new Set<string>();
  const scopes: DivisionScope[] = [];
  for (const token of tokens) {
    if (token === '') continue;
    const parsed = parseScopeToken(token);
    if (!parsed) {
      throw new Error('Invalid region/format scope');
    }
    const key = `${parsed.regionId}:${parsed.formatId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push(parsed);
  }
  return scopes;
}

async function findConflictingName(
  name: string,
  regionId: number,
  formatId: number,
  excludeId?: number,
) {
  return await prisma.division.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      regionId,
      formatId,
      ...(excludeId != null ? { NOT: { id: excludeId } } : {}),
    },
  });
}

async function copyItemPayment(
  source: { steamItemId: number; itemQuantity: number } | null | undefined,
  targetDivisionId: number,
) {
  if (!source) return;
  await upsertDivisionItemPayment(targetDivisionId, {
    steamItemId: source.steamItemId,
    itemQuantity: source.itemQuantity,
  });
}

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
      format: {
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
 * Get visible divisions only (for public use).
 * Pass formatId to limit results to one format's catalog.
 * Ordered by ID descending to show highest divisions first
 * (INVITE -> PREMIER -> INTERMEDIATE -> OPEN -> NEWCOMER)
 */
export async function getVisibleDivisions(formatId?: number) {
  return await prisma.division.findMany({
    where: { hidden: 0, ...(formatId != null ? { formatId } : {}) },
    select: {
      id: true,
      name: true,
      signupCost: true,
      regionId: true,
      formatId: true,
    },
    orderBy: { id: 'desc' },
  });
}

/**
 * Get divisions for filter UI (simplified)
 */
export async function getDivisionsForFilter() {
  return await prisma.division.findMany({
    where: { hidden: 0 },
    select: {
      id: true,
      name: true,
      regionId: true,
      formatId: true,
      region: {
        select: { name: true },
      },
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * Find the top-ranked visible division for a specific region and format.
 * Uses id DESC ordering which matches the existing convention
 * (higher id = lower division tier: INVITE > PREMIER > INTERMEDIATE > OPEN > NEWCOMER).
 */
export async function findTopDivisionByRegion(regionId: number, formatId: number) {
  return await prisma.division.findFirst({
    where: { regionId, formatId, hidden: 0 },
    orderBy: { id: 'desc' },
  });
}

/**
 * Create a new division
 *
 * Business logic validation:
 * - Division name must be unique within its region and format (case-insensitive)
 * - regionId and formatId are required
 */
export async function createDivision(data: {
  name: string;
  signupCost: number;
  regionId: number;
  formatId: number;
}) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Division name is required');
  }

  if (!data.regionId) {
    throw new Error('Region is required');
  }

  if (!data.formatId) {
    throw new Error('Format is required');
  }

  const existingDivision = await findConflictingName(trimmedName, data.regionId, data.formatId);

  if (existingDivision) {
    throw new Error('Division with this name already exists in this region and format');
  }

  return await prisma.division.create({
    data: {
      name: trimmedName,
      signupCost: data.signupCost,
      regionId: data.regionId,
      formatId: data.formatId,
      hidden: 0,
    },
  });
}

/**
 * Create the same named division across selected region × format scopes.
 * Existing names in a target scope are skipped.
 */
export async function createDivisionsForScopes(data: {
  name: string;
  signupCost: number;
  regionIds: number[];
  formatIds: number[];
  itemPayment?: DivisionItemPaymentInput;
}): Promise<DivisionBulkResult> {
  const trimmedName = data.name.trim();
  const regionIds = uniquePositiveInts(data.regionIds);
  const formatIds = uniquePositiveInts(data.formatIds);

  if (!trimmedName) {
    throw new Error('Division name is required');
  }
  if (regionIds.length === 0) {
    throw new Error('Select at least one region');
  }
  if (formatIds.length === 0) {
    throw new Error('Select at least one format');
  }

  const [regions, formats] = await Promise.all([
    prisma.region.findMany({ where: { id: { in: regionIds } }, select: { id: true } }),
    prisma.format.findMany({ where: { id: { in: formatIds } }, select: { id: true } }),
  ]);
  if (regions.length !== regionIds.length) {
    throw new Error('Region not found');
  }
  if (formats.length !== formatIds.length) {
    throw new Error('Format not found');
  }

  let created = 0;
  let skipped = 0;

  for (const regionId of regionIds) {
    for (const formatId of formatIds) {
      try {
        const division = await createDivision({
          name: trimmedName,
          signupCost: data.signupCost,
          regionId,
          formatId,
        });
        await copyItemPayment(data.itemPayment, division.id);
        created += 1;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('already exists in this region and format')
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
  }

  return { created, skipped };
}

/**
 * Copy divisions from one region+format catalog onto other scopes.
 * Copies name, cost, hidden flag, and item payment. Skips name collisions.
 */
export async function copyDivisions(data: {
  sourceRegionId?: number;
  sourceFormatId?: number;
  targetScopes: DivisionScope[];
  divisionIds?: number[];
}): Promise<DivisionBulkResult> {
  const selectedIds = uniquePositiveInts(data.divisionIds ?? []);
  const copyingById = selectedIds.length > 0;

  if (!copyingById && (data.sourceRegionId == null || data.sourceFormatId == null)) {
    throw new Error('Select a catalog to copy');
  }

  const targetScopes = data.targetScopes.filter((scope) => {
    if (
      !Number.isInteger(scope.regionId) ||
      !Number.isInteger(scope.formatId) ||
      scope.regionId < 1 ||
      scope.formatId < 1
    ) {
      return false;
    }
    if (
      !copyingById &&
      data.sourceRegionId != null &&
      data.sourceFormatId != null &&
      scope.regionId === data.sourceRegionId &&
      scope.formatId === data.sourceFormatId
    ) {
      return false;
    }
    return true;
  });

  if (targetScopes.length === 0) {
    throw new Error('Select at least one different region and format to copy into');
  }

  const sources = await prisma.division.findMany({
    where: copyingById
      ? { id: { in: selectedIds } }
      : { regionId: data.sourceRegionId, formatId: data.sourceFormatId },
    include: { itemPayment: true },
    orderBy: { id: 'asc' },
  });

  if (copyingById && sources.length !== selectedIds.length) {
    throw new Error('Division not found');
  }

  if (sources.length === 0) {
    throw new Error('No divisions found to copy');
  }

  const targetRegionIds = [...new Set(targetScopes.map((scope) => scope.regionId))];
  const targetFormatIds = [...new Set(targetScopes.map((scope) => scope.formatId))];
  const [regions, formats] = await Promise.all([
    prisma.region.findMany({ where: { id: { in: targetRegionIds } }, select: { id: true } }),
    prisma.format.findMany({ where: { id: { in: targetFormatIds } }, select: { id: true } }),
  ]);
  if (regions.length !== targetRegionIds.length) {
    throw new Error('Region not found');
  }
  if (formats.length !== targetFormatIds.length) {
    throw new Error('Format not found');
  }

  let created = 0;
  let skipped = 0;

  for (const scope of targetScopes) {
    for (const source of sources) {
      const existing = await findConflictingName(source.name, scope.regionId, scope.formatId);
      if (existing) {
        skipped += 1;
        continue;
      }

      const division = await prisma.division.create({
        data: {
          name: source.name,
          signupCost: source.signupCost,
          hidden: source.hidden,
          regionId: scope.regionId,
          formatId: scope.formatId,
        },
      });
      await copyItemPayment(source.itemPayment, division.id);
      created += 1;
    }
  }

  return { created, skipped };
}

/**
 * Update an existing division
 *
 * Business logic validation:
 * - Division must exist
 * - New name must not conflict with another division in the same region and format
 * - regionId/formatId cannot change while teams or staff are assigned
 */
export async function updateDivision(
  id: number,
  data: {
    name: string;
    signupCost: number;
    regionId: number;
    formatId: number;
  },
) {
  const trimmedName = data.name.trim();

  if (!trimmedName) {
    throw new Error('Division name is required');
  }

  if (!data.regionId) {
    throw new Error('Region is required');
  }

  if (!data.formatId) {
    throw new Error('Format is required');
  }

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

  const scopeChanging = division.regionId !== data.regionId || division.formatId !== data.formatId;
  if (scopeChanging && (division._count.teams > 0 || division._count.staffAssignments > 0)) {
    throw new Error(
      'Cannot change region or format while teams or staff are assigned to this division',
    );
  }

  const conflictingDivision = await findConflictingName(
    trimmedName,
    data.regionId,
    data.formatId,
    id,
  );

  if (conflictingDivision) {
    throw new Error('Division with this name already exists in this region and format');
  }

  return await prisma.division.update({
    where: { id },
    data: {
      name: trimmedName,
      signupCost: data.signupCost,
      regionId: data.regionId,
      formatId: data.formatId,
    },
  });
}

export async function setDivisionsHidden(ids: number[], hidden: 0 | 1) {
  const divisionIds = uniquePositiveInts(ids);
  if (divisionIds.length === 0) {
    throw new Error('Select at least one division');
  }

  const result = await prisma.division.updateMany({
    where: { id: { in: divisionIds } },
    data: { hidden },
  });

  if (result.count === 0) {
    throw new Error('Division not found');
  }

  return result;
}

export async function updateDivisionsSignupCost(
  ids: number[],
  signupCost: number,
  itemPayment: DivisionItemPaymentInput | null = null,
) {
  const divisionIds = uniquePositiveInts(ids);
  if (divisionIds.length === 0) {
    throw new Error('Select at least one division');
  }
  if (!Number.isFinite(signupCost) || signupCost < 0) {
    throw new Error('Signup cost must be zero or greater');
  }

  const applyItem = itemPayment != null && itemPayment.steamItemId > 0;
  if (applyItem && (!Number.isInteger(itemPayment.itemQuantity) || itemPayment.itemQuantity < 1)) {
    throw new Error('Item quantity is required when an item is selected');
  }

  const existing = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    select: { id: true },
  });
  if (existing.length === 0) {
    throw new Error('Division not found');
  }
  const existingIds = existing.map((division) => division.id);

  if (applyItem && itemPayment) {
    const steamItem = await prisma.steamItem.findUnique({
      where: { id: itemPayment.steamItemId },
      select: { id: true },
    });
    if (!steamItem) {
      throw new Error('Steam item not found');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.division.updateMany({
      where: { id: { in: existingIds } },
      data: { signupCost },
    });
    await tx.divisionItemPayment.deleteMany({
      where: { divisionId: { in: existingIds } },
    });
    if (applyItem && itemPayment) {
      await tx.divisionItemPayment.createMany({
        data: existingIds.map((divisionId) => ({
          divisionId,
          steamItemId: itemPayment.steamItemId,
          itemQuantity: itemPayment.itemQuantity,
        })),
      });
    }
  });

  return { count: existingIds.length };
}

function describeDeleteBlockers(counts: { teams: number; staffAssignments: number }) {
  const blockers: string[] = [];
  if (counts.teams > 0) blockers.push(`${counts.teams} team${counts.teams !== 1 ? 's' : ''}`);
  if (counts.staffAssignments > 0)
    blockers.push(
      `${counts.staffAssignments} staff member${counts.staffAssignments !== 1 ? 's' : ''} assigned to it`,
    );
  return blockers;
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

  const blockers = describeDeleteBlockers(division._count);
  if (blockers.length > 0) {
    throw new Error(`Cannot delete division: it has ${blockers.join(', ')}.`);
  }

  return await prisma.division.delete({ where: { id } });
}

export async function deleteDivisions(ids: number[]) {
  const divisionIds = uniquePositiveInts(ids);
  if (divisionIds.length === 0) {
    throw new Error('Select at least one division');
  }

  const divisions = await prisma.division.findMany({
    where: { id: { in: divisionIds } },
    include: {
      _count: {
        select: {
          teams: true,
          staffAssignments: true,
        },
      },
    },
  });

  if (divisions.length !== divisionIds.length) {
    throw new Error('Division not found');
  }

  const blocked = divisions.filter(
    (division) => division._count.teams > 0 || division._count.staffAssignments > 0,
  );
  if (blocked.length > 0) {
    const names = blocked.map((division) => division.name).join(', ');
    throw new Error(`Cannot delete division: ${names} still have teams or staff assigned.`);
  }

  const result = await prisma.division.deleteMany({
    where: { id: { in: divisionIds } },
  });

  return { deleted: result.count };
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
