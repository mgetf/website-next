/**
 * Region Service
 *
 * All region-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createCatalogClient, getRegion, getRegionIds } from '$lib/server/rama/catalog';

// ─── Rama helpers ──────────────────────────────────────────────────────────────

async function getVisibleRegionsRama(): Promise<
  { id: number; name: string; currencySymbol: string; currencyCode: string }[]
> {
  const client = createCatalogClient(ramaClientOpts());
  const ids = await getRegionIds(client);
  const results: { id: number; name: string; currencySymbol: string; currencyCode: string }[] = [];
  for (const rid of ids) {
    const r = await getRegion(client, rid);
    if (r && !r.hidden) {
      results.push({
        id: Number(rid),
        name: r.name,
        currencySymbol: r.currencySymbol,
        currencyCode: r.currencyCode,
      });
    }
  }
  results.sort((a, b) => a.id - b.id);
  return results;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all regions with their season and team counts
 * Includes hidden regions (for admin use)
 */
export async function getRegions() {
  if (isRamaBackend()) {
    const client = createCatalogClient(ramaClientOpts());
    const ids = await getRegionIds(client);
    const rows = [];
    for (const rid of ids) {
      const r = await getRegion(client, rid);
      if (!r) continue;
      rows.push({
        id: Number(rid),
        name: r.name,
        hidden: r.hidden ? 1 : 0,
        currencySymbol: r.currencySymbol,
        currencyCode: r.currencyCode,
        _count: { seasons: 0, teams: 0 },
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }

  return await prisma.region.findMany({
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
}

/**
 * Get visible regions only (for public/filter use)
 * Includes currencySymbol for displaying prices
 */
export async function getVisibleRegions() {
  if (isRamaBackend()) return getVisibleRegionsRama();

  return await prisma.region.findMany({
    where: { hidden: 0 },
    select: {
      id: true,
      name: true,
      currencySymbol: true,
      currencyCode: true,
    },
    orderBy: { id: 'asc' },
  });
}

/**
 * Get regions for filter UI (simplified)
 * Returns only id and name for visible regions
 */
export async function getRegionsForFilter() {
  if (isRamaBackend()) {
    const regions = await getVisibleRegionsRama();
    return regions.map((r) => ({ id: r.id, name: r.name }));
  }

  return await prisma.region.findMany({
    select: { id: true, name: true },
    where: { hidden: 0 },
    orderBy: { id: 'asc' },
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
    where: { name: { equals: trimmedName, mode: 'insensitive' } },
  });

  if (existingRegion) {
    throw new Error('Region with this name already exists');
  }

  return await prisma.region.create({
    data: { name: trimmedName, hidden: 0 },
  });
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
};

function currencySymbolFromCode(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? '€';
}

/**
 * Update an existing region
 *
 * Business logic validation:
 * - Region must exist
 * - New name must not conflict with another region (case-insensitive)
 */
export async function updateRegion(id: number, data: { name: string; currencyCode?: string }) {
  const trimmedName = data.name.trim();

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
      NOT: { id },
    },
  });

  if (conflictingRegion) {
    throw new Error('Region with this name already exists');
  }

  const currencyCode = data.currencyCode ?? region.currencyCode;
  const currencySymbol = currencySymbolFromCode(currencyCode);

  return await prisma.region.update({
    where: { id },
    data: {
      name: trimmedName,
      currencyCode,
      currencySymbol,
    },
  });
}

/**
 * Delete a region
 *
 * Business logic validation:
 * - Region must exist
 * - Cannot delete if any dependent records exist (seasons, teams, divisions, signups)
 */
export async function deleteRegion(id: number) {
  const region = await prisma.region.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          seasons: true,
          teams: true,
          divisions: true,
          activeSignupSeasons: true,
        },
      },
    },
  });

  if (!region) {
    throw new Error('Region not found');
  }

  const blockers: string[] = [];
  if (region._count.seasons > 0)
    blockers.push(`${region._count.seasons} season${region._count.seasons !== 1 ? 's' : ''}`);
  if (region._count.teams > 0)
    blockers.push(`${region._count.teams} team${region._count.teams !== 1 ? 's' : ''}`);
  if (region._count.divisions > 0)
    blockers.push(`${region._count.divisions} division${region._count.divisions !== 1 ? 's' : ''}`);
  if (region._count.activeSignupSeasons > 0) blockers.push('active signup configuration');

  if (blockers.length > 0) {
    throw new Error(`Cannot delete region: it has ${blockers.join(', ')}.`);
  }

  return await prisma.region.delete({ where: { id } });
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
    data: { hidden: region.hidden === 0 ? 1 : 0 },
  });
}
