export type ScopeOption = { id: number; name: string };
export type DivisionScopeOption = ScopeOption & { regionId: number };

/**
 * Regions available for a format. Empty formatId means all regions (filter "all").
 * When a format is selected, only regions that have a season in that format remain.
 */
export function filterRegionsByFormat(
  regions: ScopeOption[],
  formatId: string,
  regionIdsByFormat: Record<number, number[]>,
): ScopeOption[] {
  if (!formatId) return regions;
  const allowed = regionIdsByFormat[Number(formatId)] ?? [];
  return regions.filter((region) => allowed.includes(region.id));
}

/**
 * Divisions in a region. Empty regionId returns nothing so callers disable the
 * division dropdown instead of listing every region's Invite/Premier mixed together.
 */
export function filterDivisionsByRegion(
  divisions: DivisionScopeOption[],
  regionId: string,
): DivisionScopeOption[] {
  if (!regionId) return [];
  return divisions.filter((division) => division.regionId === Number(regionId));
}

export function isRegionAllowedForFormat(
  regionId: string,
  formatId: string,
  regionIdsByFormat: Record<number, number[]>,
): boolean {
  if (!regionId || !formatId) return true;
  const allowed = regionIdsByFormat[Number(formatId)] ?? [];
  return allowed.includes(Number(regionId));
}

export function regionIdsByFormatFromSeasons(
  seasons: { formatId: number; regionId: number }[],
): Record<number, number[]> {
  const map: Record<number, number[]> = {};
  for (const season of seasons) {
    const list = map[season.formatId] ?? [];
    if (!list.includes(season.regionId)) list.push(season.regionId);
    map[season.formatId] = list;
  }
  return map;
}
