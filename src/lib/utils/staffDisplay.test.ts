import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '#lib/constants/formats.js';
import type { StaffAssignmentDisplay } from '#lib/types/staff.js';
import {
  ALL_DIVISIONS_LABEL,
  ALL_FORMATS_LABEL,
  groupStaffByRegionAndFormat,
  groupStaffRosterByRegion,
  staffListChips,
} from './staffDisplay';

function assignment(
  overrides: Partial<StaffAssignmentDisplay> &
    Pick<StaffAssignmentDisplay, 'formatId' | 'divisionId' | 'formatName' | 'divisionName'>,
): StaffAssignmentDisplay {
  return {
    regionId: 1,
    regionName: 'EU',
    ...overrides,
  };
}

describe('staffListChips', () => {
  it('makes one chip per format with region coverage', () => {
    const chips = staffListChips([
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 1,
        divisionName: 'OPEN',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 2,
        divisionName: 'PREMIER',
      }),
      assignment({
        formatId: FORMAT_1V1,
        formatName: '1v1',
        divisionId: 1,
        divisionName: 'OPEN',
      }),
    ]);

    expect(chips).toEqual([
      {
        formatId: FORMAT_2V2,
        formatName: '2v2',
        coverage: 'EU',
        title: 'EU: OPEN, PREMIER',
      },
      {
        formatId: FORMAT_1V1,
        formatName: '1v1',
        coverage: 'EU OPEN',
        title: 'EU: OPEN',
      },
    ]);
  });

  it('joins multiple regions without listing divisions', () => {
    const chips = staffListChips([
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 1,
        divisionName: 'OPEN',
        regionName: 'EU',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 3,
        divisionName: 'NEWCOMER',
        regionId: 2,
        regionName: 'NA',
      }),
    ]);

    expect(chips[0].coverage).toBe('EU/NA');
    expect(chips[0].title).toBe('EU: OPEN · NA: NEWCOMER');
  });

  it('returns an empty list when there are no assignments', () => {
    expect(staffListChips([])).toEqual([]);
  });

  it('scopes chips to one region and omits the region name from coverage', () => {
    const chips = staffListChips(
      [
        assignment({
          formatId: FORMAT_2V2,
          formatName: '2v2',
          divisionId: 1,
          divisionName: 'OPEN',
          regionId: 1,
          regionName: 'EU',
        }),
        assignment({
          formatId: FORMAT_2V2,
          formatName: '2v2',
          divisionId: 3,
          divisionName: 'NEWCOMER',
          regionId: 2,
          regionName: 'NA',
        }),
      ],
      { regionId: 2 },
    );

    expect(chips).toEqual([
      {
        formatId: FORMAT_2V2,
        formatName: '2v2',
        coverage: 'NEWCOMER',
        title: 'NA: NEWCOMER',
      },
    ]);
  });

  it('labels region-wide and format-wide assignments without inventing divisions', () => {
    const chips = staffListChips([
      assignment({
        formatId: null,
        formatName: null,
        divisionId: null,
        divisionName: null,
        regionName: 'South America',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: null,
        divisionName: null,
        regionId: 2,
        regionName: 'EU',
      }),
    ]);

    expect(chips).toEqual([
      {
        formatId: null,
        formatName: ALL_FORMATS_LABEL,
        coverage: 'South America',
        title: 'South America: all formats',
      },
      {
        formatId: FORMAT_2V2,
        formatName: '2v2',
        coverage: `EU ${ALL_DIVISIONS_LABEL}`,
        title: `EU: ${ALL_DIVISIONS_LABEL}`,
      },
    ]);
  });
});

describe('groupStaffByRegionAndFormat', () => {
  it('nests formats under region with optional division chips', () => {
    const grouped = groupStaffByRegionAndFormat([
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 1,
        divisionName: 'OPEN',
        regionName: 'EU',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 3,
        divisionName: 'NEWCOMER',
        regionId: 2,
        regionName: 'NA',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 2,
        divisionName: 'PREMIER',
        regionName: 'EU',
      }),
      assignment({
        formatId: null,
        formatName: null,
        divisionId: null,
        divisionName: null,
        regionName: 'EU',
      }),
    ]);

    expect(grouped.map((group) => group.regionName)).toEqual(['EU', 'NA']);
    expect(grouped[0].formats.map((format) => format.formatName)).toEqual([
      '2v2',
      ALL_FORMATS_LABEL,
    ]);
    expect(grouped[0].formats[0].chips.map((chip) => chip.label)).toEqual(['OPEN', 'PREMIER']);
    expect(grouped[0].formats[1].chips.map((chip) => chip.label)).toEqual([ALL_FORMATS_LABEL]);
    expect(grouped[1].formats[0].chips.map((chip) => chip.label)).toEqual(['NEWCOMER']);
  });
});

describe('groupStaffRosterByRegion', () => {
  const regions = [
    { id: 1, name: 'Europe' },
    { id: 2, name: 'North America' },
    { id: 3, name: 'Australia' },
  ];

  function member(
    steamId: string,
    assignments: StaffAssignmentDisplay[],
    permissionLevel = 'MODERATOR',
  ) {
    return {
      steamId,
      steamUsername: steamId,
      permissionLevel,
      staffAssignments: assignments,
    };
  }

  it('puts staff into every assigned region and sorts NA before EU', () => {
    const naEu = member('both', [
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 1,
        divisionName: 'OPEN',
        regionId: 1,
        regionName: 'Europe',
      }),
      assignment({
        formatId: FORMAT_2V2,
        formatName: '2v2',
        divisionId: 3,
        divisionName: 'NEWCOMER',
        regionId: 2,
        regionName: 'North America',
      }),
    ]);
    const euOnly = member('eu', [
      assignment({
        formatId: FORMAT_1V1,
        formatName: '1v1',
        divisionId: 4,
        divisionName: 'HIGH',
        regionId: 1,
        regionName: 'Europe',
      }),
    ]);

    const groups = groupStaffRosterByRegion([naEu, euOnly], regions);

    expect(groups.map((group) => group.regionName)).toEqual(['North America', 'Europe']);
    expect(groups[0].members.map((row) => row.steamId)).toEqual(['both']);
    expect(groups[1].members.map((row) => row.steamId)).toEqual(['both', 'eu']);
  });

  it('skips empty regions and collects staff without assignments', () => {
    const groups = groupStaffRosterByRegion([member('global', [], 'ADMIN')], regions);

    expect(groups).toEqual([
      {
        regionId: null,
        regionName: 'No region',
        members: [member('global', [], 'ADMIN')],
      },
    ]);
  });
});
