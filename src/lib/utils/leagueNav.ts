import type { LeagueNav, LeagueNavCell, LeagueNavFormat, LeagueNavRegion } from '$lib/types/league';
import { getRegionAbbr, getRegionFlagCode, sortRegionsByAbbr } from '$lib/utils/region';

/** Flagship formats first, then remaining formats in the order provided. */
const PREFERRED_FORMAT_CODES = ['2v2', '1v1'];

export interface LeagueNavFormatInput {
  id: number;
  code: string;
  name: string;
  themeKey: string;
}

export interface LeagueNavSeasonInput {
  id: number;
  seasonNum: number;
  regionId: number;
  formatId: number;
}

export function leaguePageHref(formatCode: string, seasonId?: number, regionId?: number): string {
  const path = `/leagues/${formatCode}`;
  if (seasonId && regionId) {
    return `${path}?season=${seasonId}&region=${regionId}`;
  }
  return path;
}

/**
 * Build the public leagues mega-menu from formats, regions, and seasons.
 * Seasons must already be ordered newest-first (seasonNum desc).
 * Each format × region cell points at the most recent season in that pair.
 */
export function buildLeagueNav(
  formats: LeagueNavFormatInput[],
  regions: { id: number; name: string }[],
  seasons: LeagueNavSeasonInput[],
): LeagueNav {
  const latestByKey = new Map<string, LeagueNavSeasonInput>();

  for (const season of seasons) {
    const key = `${season.formatId}:${season.regionId}`;
    if (!latestByKey.has(key)) {
      latestByKey.set(key, season);
    }
  }

  const usedRegionIds = new Set(
    seasons.filter((s) => formats.some((f) => f.id === s.formatId)).map((s) => s.regionId),
  );

  const navRegions: LeagueNavRegion[] = sortRegionsByAbbr(
    regions
      .filter((region) => usedRegionIds.has(region.id))
      .map((region) => ({
        id: region.id,
        name: region.name,
        abbr: getRegionAbbr(region.name),
        flagCode: getRegionFlagCode(region.name),
      })),
  );

  const navFormats: LeagueNavFormat[] = sortFormats(formats)
    .map((format) => {
      const cells: LeagueNavCell[] = [];
      for (const region of navRegions) {
        const season = latestByKey.get(`${format.id}:${region.id}`);
        if (!season) continue;
        cells.push({
          regionId: region.id,
          seasonId: season.id,
          seasonNum: season.seasonNum,
          href: leaguePageHref(format.code, season.id, region.id),
        });
      }

      return {
        id: format.id,
        code: format.code,
        name: format.name,
        href: leaguePageHref(format.code),
        themeKey: format.themeKey,
        cells,
      };
    })
    .filter((format) => format.cells.length > 0);

  return { formats: navFormats, regions: navRegions };
}

function sortFormats<T extends { code: string }>(formats: T[]): T[] {
  return [...formats].sort((a, b) => {
    const ai = PREFERRED_FORMAT_CODES.indexOf(a.code);
    const bi = PREFERRED_FORMAT_CODES.indexOf(b.code);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
