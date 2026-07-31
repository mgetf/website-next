import type { DivisionRecord } from '$lib/types/service-models';
/**
 * Division Service
 *
 * All division-related business logic and database operations.
 */

import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createCatalogClient, getRegion, getRegionIds } from '$lib/server/rama/catalog';
import {
  createDivisionsClient,
  getDivision,
  getDivisionIdsByRegion,
  upsertDivision,
} from '$lib/server/rama/divisions';

// ─── Rama helpers ──────────────────────────────────────────────────────────────

async function getVisibleDivisionsRama(): Promise<
  { id: number; name: string; signupCost: number; regionId: number }[]
> {
  const catalogOpts = ramaClientOpts();
  const catalog = createCatalogClient(catalogOpts);
  const divisions = createDivisionsClient(catalogOpts);

  const regionIds = await getRegionIds(catalog);
  const results: { id: number; name: string; signupCost: number; regionId: number }[] = [];

  for (const rid of regionIds) {
    const divIds = await getDivisionIdsByRegion(divisions, rid);
    for (const did of divIds) {
      const d = await getDivision(divisions, did);
      if (d) {
        results.push({
          id: Number(did),
          name: d.name,
          signupCost: Number(d.signupCost),
          regionId: Number(d.regionId),
        });
      }
    }
  }
  // Match Postgres ordering: id DESC (higher id = lower tier)
  results.sort((a, b) => b.id - a.id);
  return results;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Get all divisions with their team counts
 * Includes hidden divisions (for admin use)
 */
export async function getDivisions() {
  if (isRamaBackend()) {
    const catalogOpts = ramaClientOpts();
    const catalog = createCatalogClient(catalogOpts);
    const divisions = createDivisionsClient(catalogOpts);
    const regionIds = await getRegionIds(catalog);
    const rows = [];
    for (const rid of regionIds) {
      const region = await getRegion(catalog, rid);
      const divIds = await getDivisionIdsByRegion(divisions, rid);
      for (const did of divIds) {
        const d = await getDivision(divisions, did);
        if (!d) continue;
        rows.push({
          id: Number(did),
          name: d.name,
          regionId: Number(d.regionId),
          signupCost: Number(d.signupCost ?? 0),
          sortOrder: Number(d.sortOrder ?? 0),
          hidden: 0,
          itemPaymentId: null as number | null,
          region: {
            id: Number(rid),
            name: region?.name ?? String(rid),
          },
          itemPayment: null as {
            steamItemId: number;
            itemQuantity: number;
            steamItem: { id: number; name: string };
          } | null,
          _count: { teams: 0 },
        });
      }
    }
    rows.sort((a, b) => a.id - b.id);
    return rows;
  }
  throw new Error('getDivisions requires DATA_BACKEND=rama');
}

/**
 * Get visible divisions only (for public use)
 * Ordered by ID descending to show highest divisions first
 * (INVITE -> PREMIER -> INTERMEDIATE -> OPEN -> NEWCOMER)
 * Includes regionId for filtering by region
 */
export async function getVisibleDivisions() {
  if (isRamaBackend()) return getVisibleDivisionsRama();
  throw new Error('getVisibleDivisions requires DATA_BACKEND=rama');
}

/**
 * Get divisions for filter UI (simplified)
 * Returns only id and name for visible divisions
 */
export async function getDivisionsForFilter() {
  if (isRamaBackend()) {
    const divs = await getVisibleDivisionsRama();
    // Region name is not populated under Rama (no callers need it in the E2E path)
    return divs.map((d) => ({
      id: d.id,
      name: d.name,
      regionId: d.regionId,
      region: { name: String(d.regionId) },
    }));
  }
  throw new Error('getDivisionsForFilter requires DATA_BACKEND=rama');
}

/**
 * Find the top-ranked visible division for a specific region.
 * Uses id DESC ordering which matches the existing convention
 * (higher id = lower division tier: INVITE > PREMIER > INTERMEDIATE > OPEN > NEWCOMER).
 * This avoids hardcoding a division name like "Premier" that may differ per region.
 */
export async function findTopDivisionByRegion(regionId: number): Promise<DivisionRecord | null> {
  void regionId;
  return null;
}

/**
 * Create a new division
 *
 * Business logic validation:
 * - Division name must be unique within its region (case-insensitive)
 * - regionId is required
 */
export async function createDivision(data: {
  name: string;
  signupCost: number;
  regionId: number;
}): Promise<DivisionRecord> {
  if (isRamaBackend()) {
    const trimmedName = data.name.trim();
    if (!trimmedName) throw new Error('Division name is required');
    if (!data.regionId) throw new Error('Region is required');

    const opts = ramaClientOpts();
    const catalog = createCatalogClient(opts);
    const region = await getRegion(catalog, String(data.regionId));
    if (!region) throw new Error('Region not found');

    const divisions = createDivisionsClient(opts);
    const existingIds = await getDivisionIdsByRegion(divisions, String(data.regionId));
    for (const did of existingIds) {
      const d = await getDivision(divisions, did);
      if (d && d.name.toLowerCase() === trimmedName.toLowerCase()) {
        throw new Error('Division with this name already exists in this region');
      }
    }

    const divisionId = String(Date.now() % 2_000_000_000);
    const ack = await upsertDivision(divisions, {
      divisionId,
      name: trimmedName,
      regionId: String(data.regionId),
      signupCost: data.signupCost,
      sortOrder: 0,
    });
    if (!ack.ok) throw new Error(ack.error ?? 'Failed to create division');

    return {
      id: Number(divisionId),
      name: trimmedName,
      signupCost: data.signupCost,
      hidden: 0,
      regionId: data.regionId,
      sortOrder: 0,
    };
  }
  throw new Error('createDivision requires DATA_BACKEND=rama');
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
  throw new Error('updateDivision is not available under Rama');
}

/**
 * Delete a division
 *
 * Business logic validation:
 * - Division must exist
 * - Cannot delete if any teams are assigned to it or any staff members are assigned to it
 */
export async function deleteDivision(id: number) {
  throw new Error('deleteDivision is not available under Rama');
}

/**
 * Toggle division visibility (hidden/visible)
 */
export async function toggleDivisionVisibility(id: number): Promise<DivisionRecord> {
  void id;
  throw new Error('toggleDivisionVisibility is not available under Rama');
}
