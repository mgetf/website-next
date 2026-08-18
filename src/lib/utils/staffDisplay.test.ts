import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';
import type { StaffAssignmentDisplay } from '$lib/types/staff';
import { groupStaffByFormatAndRegion, staffListChips } from './staffDisplay';

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
