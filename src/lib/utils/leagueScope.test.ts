import { describe, expect, it } from 'vitest';
import {
  filterDivisionsByRegion,
  filterRegionsByFormat,
  isRegionAllowedForFormat,
  regionIdsByFormatFromSeasons,
} from './leagueScope';

const regions = [
  { id: 1, name: 'NA' },
  { id: 2, name: 'EU' },
  { id: 3, name: 'AU' },
];

const divisions = [
  { id: 10, name: 'Invite', regionId: 1 },
  { id: 11, name: 'Invite', regionId: 2 },
  { id: 12, name: 'Open', regionId: 1 },
];

const regionIdsByFormat = {
  1: [1, 2],
  2: [1, 3],
};

describe('filterRegionsByFormat', () => {
  it('returns all regions when no format is selected', () => {
    expect(filterRegionsByFormat(regions, '', regionIdsByFormat)).toEqual(regions);
  });

  it('keeps only regions that have the selected format', () => {
    expect(filterRegionsByFormat(regions, '1', regionIdsByFormat).map((r) => r.name)).toEqual([
      'NA',
      'EU',
    ]);
    expect(filterRegionsByFormat(regions, '2', regionIdsByFormat).map((r) => r.name)).toEqual([
      'NA',
      'AU',
    ]);
  });

  it('returns no regions when the format has no seasons', () => {
    expect(filterRegionsByFormat(regions, '99', regionIdsByFormat)).toEqual([]);
  });
});

describe('filterDivisionsByRegion', () => {
  it('returns nothing until a region is selected', () => {
    expect(filterDivisionsByRegion(divisions, '')).toEqual([]);
  });

  it('returns only divisions in the selected region', () => {
    expect(filterDivisionsByRegion(divisions, '1').map((d) => d.id)).toEqual([10, 12]);
    expect(filterDivisionsByRegion(divisions, '2').map((d) => d.id)).toEqual([11]);
  });
});

describe('isRegionAllowedForFormat', () => {
  it('allows any region when format or region is unset', () => {
    expect(isRegionAllowedForFormat('', '1', regionIdsByFormat)).toBe(true);
    expect(isRegionAllowedForFormat('1', '', regionIdsByFormat)).toBe(true);
  });

  it('rejects a region that has no season for the format', () => {
    expect(isRegionAllowedForFormat('3', '1', regionIdsByFormat)).toBe(false);
    expect(isRegionAllowedForFormat('2', '1', regionIdsByFormat)).toBe(true);
  });
});

describe('regionIdsByFormatFromSeasons', () => {
  it('dedupes format/region pairs', () => {
    expect(
      regionIdsByFormatFromSeasons([
        { formatId: 1, regionId: 1 },
        { formatId: 1, regionId: 1 },
        { formatId: 1, regionId: 2 },
        { formatId: 2, regionId: 1 },
      ]),
    ).toEqual({ 1: [1, 2], 2: [1] });
  });
});
