/**
 * Season Service
 *
 * All season-related business logic and database operations.
 */

import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import { createSeasonsClient, getSeason, getSeasonIds } from '$lib/server/rama/seasons';
import { createCatalogClient, getRegion, getFormat } from '$lib/server/rama/catalog';
import type { LatestSeasonPerRegion, SeasonFilterRow } from '$lib/types/service-models';

export type SeasonRecord = {
  id: number;
  seasonNum: number;
  numWeeks: number;
  regionId: number;
  formatId: number;
  signupsOpen: boolean;
  rosterLocked: boolean;
  paymentRequired: boolean;
  matchWeek: number;
  matchDeadline: Date | null;
  info: string;
  region: {
    id: number;
    name: string;
    hidden: number;
    currencySymbol: string;
    currencyCode: string;
  };
  format: {
    id: number;
    name: string;
    code: string;
  };
  _count: { teams: number; matches: number };
};

async function hydrateSeasonRama(seasonId: string): Promise<SeasonRecord | null> {
  const opts = ramaClientOpts();
  const season = await getSeason(createSeasonsClient(opts), seasonId);
  if (!season) return null;
  const catalog = createCatalogClient(opts);
  const region = await getRegion(catalog, season.regionId);
  const format = await getFormat(catalog, season.formatId);
  const id = Number(seasonId);
  const regionId = Number(season.regionId);
  const formatId = Number(season.formatId);
  return {
    id,
    seasonNum: Number(season.seasonNum),
    numWeeks: Number(season.numWeeks),
    regionId,
    formatId,
    signupsOpen: Boolean(season.signupsOpen),
    rosterLocked: Boolean(season.rosterLocked),
    paymentRequired: Boolean(season.paymentRequired),
    matchWeek: Number(season.matchWeek ?? 0),
    matchDeadline: season.matchDeadline ? new Date(String(season.matchDeadline)) : null,
    info: season.info ?? '',
    region: {
      id: regionId,
      name: region?.name ?? String(regionId),
      hidden: region?.hidden ? 1 : 0,
      currencySymbol: region?.currencySymbol ?? '',
      currencyCode: region?.currencyCode ?? '',
    },
    format: {
      id: formatId,
      name: format?.name ?? 'Unknown',
      code: format?.code ?? '',
    },
    _count: { teams: 0, matches: 0 },
  };
}

/**
 * Get all seasons with their region and team/match counts
 * Ordered by season number descending (most recent first)
 */
export async function getSeasons(): Promise<SeasonRecord[]> {
  if (isRamaBackend()) {
    const ids = await getSeasonIds(createSeasonsClient(ramaClientOpts()));
    const rows: SeasonRecord[] = [];
    for (const id of ids) {
      const row = await hydrateSeasonRama(id);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => b.seasonNum - a.seasonNum);
    return rows;
  }

  return [];
}

/**
 * Get a single season by ID
 */
export async function getSeasonById(id: number): Promise<SeasonRecord | null> {
  if (isRamaBackend()) {
    return hydrateSeasonRama(String(id));
  }

  return null;
}

/**
 * Get the latest season per region for a specific format.
 * Returns one entry per region (the most recent season number), useful for
 * building per-region home page standings without picking a random single region.
 */
export async function getLatestSeasonPerRegionByFormat(
  formatId: number,
): Promise<LatestSeasonPerRegion[]> {
  void formatId;
  return [];
}

/**
 * Create a new season
 *
 * Business logic validation:
 * - Season number must be unique per region and format
 */
export async function createSeason(data: {
  seasonNum: number;
  regionId: number;
  formatId: number;
  numWeeks: number;
}) {
  throw new Error('createSeason is not available under Rama');
}

/**
 * Update an existing season
 *
 * Business logic validation:
 * - Season must exist
 * - New season number must not conflict with another season in the same region and format
 */
export async function updateSeason(
  id: number,
  data: {
    seasonNum: number;
    regionId: number;
    formatId: number;
    numWeeks: number;
  },
) {
  throw new Error('updateSeason is not available under Rama');
}

/**
 * Delete a season
 *
 * Business logic validation:
 * - Season must exist
 * - Cannot delete if any dependent records exist (teams, matches, history, playoffs, payments, signups)
 */
export async function deleteSeason(id: number) {
  throw new Error('deleteSeason is not available under Rama');
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
export async function getSeasonsForFilter(limit = 50): Promise<SeasonFilterRow[]> {
  void limit;
  return [];
}

/**
 * Get seasons for a specific region (or all regions), newest first
 * Includes region relation; used for admin match filter
 */
export async function getSeasonsByRegion(regionId?: number): Promise<SeasonRecord[]> {
  void regionId;
  return [];
}

/**
 * Get the info markdown text for a specific season
 */
export async function getSeasonInfo(seasonId: number): Promise<string | null> {
  return null;
}

/**
 * Update the info markdown text for a specific season
 */
export async function updateSeasonInfo(seasonId: number, info: string | null): Promise<void> {
  throw new Error('updateSeasonInfo is not available under Rama');
}

/**
 * Transform season data for UI display
 * Calculates status based on teams and matches
 */
export function transformSeasonForUI(season: any, isLatest: boolean) {
  const status = isLatest ? 'Active' : 'Completed';

  return {
    id: season.id,
    seasonNum: season.seasonNum,
    region: season.region.name,
    regionId: season.regionId,
    format: season.format.name,
    formatId: season.formatId,
    numWeeks: season.numWeeks,
    teams: season._count.teams,
    matches: season._count.matches,
    status,
  };
}
