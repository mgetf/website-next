import { describe, expect, it } from 'vitest';
import {
  formatsWithSeasons,
  regionsForFormat,
  resolveAdminMatchFilters,
  seasonsForScope,
} from './matchFilters';

const formats = [
  { id: 1, name: '6v6' },
  { id: 2, name: 'Highlander' },
  { id: 3, name: 'Ultiduo' },
];

const regions = [
  { id: 1, name: 'NA' },
  { id: 2, name: 'EU' },
  { id: 3, name: 'AU' },
];

const seasons = [
  { id: 20, seasonNum: 2, regionId: 1, formatId: 1 },
  { id: 19, seasonNum: 2, regionId: 1, formatId: 2 },
  { id: 18, seasonNum: 2, regionId: 2, formatId: 1 },
  { id: 10, seasonNum: 1, regionId: 1, formatId: 1 },
  { id: 9, seasonNum: 1, regionId: 1, formatId: 2 },
  { id: 8, seasonNum: 1, regionId: 3, formatId: 2 },
];

describe('formatsWithSeasons', () => {
  it('hides formats that have no seasons', () => {
    expect(formatsWithSeasons(formats, seasons).map((format) => format.name)).toEqual([
      '6v6',
      'Highlander',
    ]);
  });
});

describe('regionsForFormat', () => {
  it('returns no regions until a format is selected', () => {
    expect(regionsForFormat(regions, seasons, null)).toEqual([]);
  });

  it('keeps regions that have a season in the selected format', () => {
    expect(regionsForFormat(regions, seasons, 1).map((region) => region.name)).toEqual([
      'NA',
      'EU',
    ]);
    expect(regionsForFormat(regions, seasons, 2).map((region) => region.name)).toEqual([
      'NA',
      'AU',
    ]);
  });
});

describe('seasonsForScope', () => {
  it('returns one season number per format and region', () => {
    expect(seasonsForScope(seasons, 1, 1).map((season) => season.seasonNum)).toEqual([2, 1]);
    expect(seasonsForScope(seasons, 2, 1).map((season) => season.id)).toEqual([19, 9]);
  });

  it('returns nothing when format or region is missing', () => {
    expect(seasonsForScope(seasons, null, 1)).toEqual([]);
    expect(seasonsForScope(seasons, 1, null)).toEqual([]);
  });
});

describe('resolveAdminMatchFilters', () => {
  const base = { formats, regions, seasons };

  it('defaults to the first format, its first region, and the newest season', () => {
    expect(
      resolveAdminMatchFilters({ ...base, formatId: null, regionId: null, seasonId: null }),
    ).toEqual({ formatId: 1, regionId: 1, seasonId: 20 });
  });

  it("keeps a region that still belongs to the new format and picks that scope's newest season", () => {
    expect(resolveAdminMatchFilters({ ...base, formatId: 2, regionId: 1, seasonId: 20 })).toEqual({
      formatId: 2,
      regionId: 1,
      seasonId: 19,
    });
  });

  it('drops a region the format does not play in', () => {
    expect(resolveAdminMatchFilters({ ...base, formatId: 1, regionId: 3, seasonId: null })).toEqual(
      { formatId: 1, regionId: 1, seasonId: 20 },
    );
  });

  it('infers format and region from a season-only link', () => {
    expect(
      resolveAdminMatchFilters({ ...base, formatId: null, regionId: null, seasonId: 8 }),
    ).toEqual({ formatId: 2, regionId: 3, seasonId: 8 });
  });

  it('keeps an explicit region and picks a format that has seasons there', () => {
    expect(
      resolveAdminMatchFilters({ ...base, formatId: null, regionId: 3, seasonId: null }),
    ).toEqual({ formatId: 2, regionId: 3, seasonId: 8 });
  });

  it('keeps a consistent format, region, and season', () => {
    expect(resolveAdminMatchFilters({ ...base, formatId: 1, regionId: 2, seasonId: 18 })).toEqual({
      formatId: 1,
      regionId: 2,
      seasonId: 18,
    });
  });
});
