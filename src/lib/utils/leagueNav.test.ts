import { describe, expect, it } from 'vitest';
import { buildLeagueNav, leaguePageHref } from './leagueNav';

const formats = [
  { id: 1, code: '1v1', name: '1v1', themeKey: 'purple' },
  { id: 2, code: '2v2', name: '2v2', themeKey: 'blue' },
  { id: 3, code: 'ultiduo', name: 'Ultiduo', themeKey: 'orange' },
  { id: 4, code: 'bball', name: 'BBall', themeKey: 'primary' },
];

const regions = [
  { id: 10, name: 'Europe' },
  { id: 11, name: 'North America' },
  { id: 12, name: 'Asia' },
  { id: 13, name: 'South America' },
];

describe('leaguePageHref', () => {
  it('builds a format page link and an optional season/region deep link', () => {
    expect(leaguePageHref('2v2')).toBe('/leagues/2v2');
    expect(leaguePageHref('ultiduo', 44, 10)).toBe('/leagues/ultiduo?season=44&region=10');
  });
});

describe('buildLeagueNav', () => {
  it('builds a format × region grid pointing at the latest season in each pair', () => {
    const nav = buildLeagueNav(formats, regions, [
      { id: 101, seasonNum: 12, regionId: 11, formatId: 2 },
      { id: 100, seasonNum: 11, regionId: 11, formatId: 2 },
      { id: 201, seasonNum: 8, regionId: 10, formatId: 2 },
      { id: 301, seasonNum: 4, regionId: 11, formatId: 1 },
      { id: 401, seasonNum: 2, regionId: 12, formatId: 3 },
    ]);

    expect(nav.regions.map((r) => r.abbr)).toEqual(['NA', 'EU', 'ASIA']);
    expect(nav.formats.map((f) => f.code)).toEqual(['2v2', '1v1', 'ultiduo']);

    const twoVTwo = nav.formats[0];
    expect(twoVTwo.cells.map((c) => [c.regionId, c.seasonId, c.seasonNum, c.href])).toEqual([
      [11, 101, 12, '/leagues/2v2?season=101&region=11'],
      [10, 201, 8, '/leagues/2v2?season=201&region=10'],
    ]);

    const oneVOne = nav.formats[1];
    expect(oneVOne.cells).toEqual([
      {
        regionId: 11,
        seasonId: 301,
        seasonNum: 4,
        href: '/leagues/1v1?season=301&region=11',
      },
    ]);
  });

  it('omits formats and regions that have no seasons', () => {
    const nav = buildLeagueNav(formats, regions, [
      { id: 1, seasonNum: 1, regionId: 13, formatId: 4 },
    ]);

    expect(nav.formats.map((f) => f.code)).toEqual(['bball']);
    expect(nav.regions.map((r) => r.abbr)).toEqual(['SA']);
    expect(nav.formats[0]?.cells[0]?.href).toBe('/leagues/bball?season=1&region=13');
  });
});
