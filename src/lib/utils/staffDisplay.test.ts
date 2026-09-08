import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';
import type { StaffAssignmentDisplay } from '$lib/types/staff';
import {
  groupStaffByFormatAndRegion,
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
});

describe('groupStaffByFormatAndRegion', () => {
  it('nests divisions under format then region', () => {
    const grouped = groupStaffByFormatAndRegion([
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
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].formatName).toBe('2v2');
    expect(grouped[0].regions.map((region) => region.regionName)).toEqual(['EU', 'NA']);
    expect(grouped[0].regions[0].chips.map((chip) => chip.divisionName)).toEqual([
      'OPEN',
      'PREMIER',
    ]);
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
