export type ScopeOption = { id: number; name: string };
export type DivisionScopeOption = ScopeOption & { regionId: number; formatId: number };

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
 * Divisions in a region, optionally narrowed to a format.
 * Empty regionId returns nothing so callers disable the
 * division dropdown instead of listing every region's Invite/Premier mixed together.
 */
export function filterDivisionsByRegion(
  divisions: DivisionScopeOption[],
  regionId: string,
): DivisionScopeOption[] {
  return filterDivisionsByRegionAndFormat(divisions, regionId, '');
}

export function filterDivisionsByRegionAndFormat(
  divisions: DivisionScopeOption[],
  regionId: string,
  formatId: string,
): DivisionScopeOption[] {
  if (!regionId) return [];
  const region = Number(regionId);
  const format = formatId ? Number(formatId) : null;
  return divisions.filter((division) => {
    if (division.regionId !== region) return false;
    if (format != null && Number.isFinite(format) && format > 0) {
      return division.formatId === format;
    }
    return true;
  });
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
