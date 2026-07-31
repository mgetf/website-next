import type { RegionRecord } from '$lib/types/service-models';
/**
 * Region Service
 *
 * All region-related business logic and database operations.
 */

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
  throw new Error('getRegions requires DATA_BACKEND=rama');
}

/**
 * Get visible regions only (for public/filter use)
 * Includes currencySymbol for displaying prices
 */
export async function getVisibleRegions() {
  if (isRamaBackend()) return getVisibleRegionsRama();
  throw new Error('getVisibleRegions requires DATA_BACKEND=rama');
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
  throw new Error('getRegionsForFilter requires DATA_BACKEND=rama');
}

/**
 * Create a new region
 *
 * Business logic validation:
 * - Region name must be unique (case-insensitive)
 */
export async function createRegion(name: string) {
  throw new Error('createRegion is not available under Rama');
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
  throw new Error('updateRegion is not available under Rama');
}

/**
 * Delete a region
 *
 * Business logic validation:
 * - Region must exist
 * - Cannot delete if any dependent records exist (seasons, teams, divisions, signups)
 */
export async function deleteRegion(id: number) {
  throw new Error('deleteRegion is not available under Rama');
}

/**
 * Toggle region visibility (hidden/visible)
 */
export async function toggleRegionVisibility(id: number): Promise<RegionRecord> {
  void id;
  throw new Error('toggleRegionVisibility is not available under Rama');
}
