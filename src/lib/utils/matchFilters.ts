export type MatchFilterOption = { id: number; name: string };

export type SeasonFilterOption = {
  id: number;
  seasonNum: number;
  regionId: number;
  formatId: number;
};

export type ResolvedMatchFilters = {
  formatId: number | null;
  regionId: number | null;
  seasonId: number | null;
};

export function parseFilterId(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Formats that have at least one season. Others cannot drive the region or season lists. */
export function formatsWithSeasons<T extends MatchFilterOption>(
  formats: T[],
  seasons: SeasonFilterOption[],
): T[] {
  return formats.filter((format) => seasons.some((season) => season.formatId === format.id));
}

/** Regions that have a season in the selected format. */
export function regionsForFormat<T extends MatchFilterOption>(
  regions: T[],
  seasons: SeasonFilterOption[],
  formatId: number | null,
): T[] {
  if (formatId == null) return [];
  return regions.filter((region) =>
    seasons.some((season) => season.formatId === formatId && season.regionId === region.id),
  );
}

/**
 * Seasons for one format and region.
 * Callers should pass seasons newest-first; the first item is the default season.
 */
export function seasonsForScope(
  seasons: SeasonFilterOption[],
  formatId: number | null,
  regionId: number | null,
): SeasonFilterOption[] {
  if (formatId == null || regionId == null) return [];
  return seasons.filter((season) => season.formatId === formatId && season.regionId === regionId);
}

/**
 * Pick a format, region, and season that are consistent with each other.
 * A child selection is kept when it still belongs to its parent; otherwise it
 * falls back to the first available option (newest season).
 */
export function resolveAdminMatchFilters(input: {
  formats: MatchFilterOption[];
  regions: MatchFilterOption[];
  seasons: SeasonFilterOption[];
  formatId: number | null;
  regionId: number | null;
  seasonId: number | null;
}): ResolvedMatchFilters {
  const availableFormats = formatsWithSeasons(input.formats, input.seasons);
  const requestedSeason =
    input.seasonId == null
      ? undefined
      : input.seasons.find((season) => season.id === input.seasonId);

  let formatId = input.formatId;
  let regionId = input.regionId;

  if (requestedSeason && formatId == null) formatId = requestedSeason.formatId;
  if (requestedSeason && regionId == null) regionId = requestedSeason.regionId;

  if (formatId == null && regionId != null) {
    const formatForRegion = availableFormats.find((format) =>
      input.seasons.some((season) => season.formatId === format.id && season.regionId === regionId),
    );
    if (formatForRegion) formatId = formatForRegion.id;
  }

  if (formatId == null || !availableFormats.some((format) => format.id === formatId)) {
    formatId = availableFormats[0]?.id ?? null;
  }

  const availableRegions = regionsForFormat(input.regions, input.seasons, formatId);
  if (regionId == null || !availableRegions.some((region) => region.id === regionId)) {
    if (
      requestedSeason &&
      availableRegions.some((region) => region.id === requestedSeason.regionId)
    ) {
      regionId = requestedSeason.regionId;
    } else {
      regionId = availableRegions[0]?.id ?? null;
    }
  }

  const availableSeasons = seasonsForScope(input.seasons, formatId, regionId);
  const seasonId = availableSeasons.some((season) => season.id === input.seasonId)
    ? input.seasonId
    : (availableSeasons[0]?.id ?? null);

  return { formatId, regionId, seasonId };
}
