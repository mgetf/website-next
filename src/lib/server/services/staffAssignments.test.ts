import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import {
  mapStaffAssignmentForDisplay,
  parseStaffAssignmentTokens,
  staffForLeagueFromAssignments,
  type LeagueStaffAssignment,
} from './staffAssignments';

function assignment(
  overrides: Partial<LeagueStaffAssignment> &
    Pick<LeagueStaffAssignment, 'formatId' | 'regionId' | 'divisionId'>,
): LeagueStaffAssignment {
  return {
    user: {
      steamId: '76561198000000000',
      steamUsername: 'Player',
      steamAvatar: null,
      permissionLevel: 'MODERATOR',
    },
    division: { id: overrides.divisionId, name: 'Premier' },
    ...overrides,
  };
}

describe('parseStaffAssignmentTokens', () => {
  it('parses formatId:divisionId tokens and skips blanks', () => {
    expect(parseStaffAssignmentTokens([`${FORMAT_2V2}:15`, '', `${FORMAT_1V1}:8`])).toEqual([
      { formatId: FORMAT_2V2, divisionId: 15 },
      { formatId: FORMAT_1V1, divisionId: 8 },
    ]);
  });

  it('dedupes the same format and division pair', () => {
    expect(parseStaffAssignmentTokens([`${FORMAT_2V2}:15`, `${FORMAT_2V2}:15`])).toEqual([
      { formatId: FORMAT_2V2, divisionId: 15 },
    ]);
  });

  it('rejects malformed tokens', () => {
    expect(() => parseStaffAssignmentTokens([`${FORMAT_2V2}:15`, 'nope'])).toThrow();
  });
});

describe('staffForLeagueFromAssignments', () => {
  it('keeps only staff for the requested format and region', () => {
    const rows = [
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: 10,
        user: {
          steamId: '1',
          steamUsername: 'VivalAdmin',
          steamAvatar: null,
          permissionLevel: 'ADMIN',
        },
        division: { id: 10, name: 'Premier' },
      }),
      assignment({
        formatId: FORMAT_1V1,
        regionId: 1,
        divisionId: 10,
        user: {
          steamId: '2',
          steamUsername: 'OneVOneAdmin',
          steamAvatar: null,
          permissionLevel: 'ADMIN',
        },
        division: { id: 10, name: 'Premier' },
      }),
      assignment({
        formatId: FORMAT_2V2,
        regionId: 2,
        divisionId: 20,
        user: {
          steamId: '3',
          steamUsername: 'EuAdmin',
          steamAvatar: null,
          permissionLevel: 'MODERATOR',
        },
        division: { id: 20, name: 'Invite' },
      }),
    ];

    const grouped = staffForLeagueFromAssignments(rows, FORMAT_2V2, 1);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].division).toEqual({ id: 10, name: 'Premier' });
    expect(grouped[0].staff.map((member) => member.steamId)).toEqual(['1']);
    expect(grouped[0].staff[0].role).toBe('Head Admin');
  });

  it('sorts head admins before moderators and divisions by id descending', () => {
    const rows = [
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: 5,
        user: {
          steamId: 'm',
          steamUsername: 'Mod',
          steamAvatar: null,
          permissionLevel: 'MODERATOR',
        },
        division: { id: 5, name: 'Open' },
      }),
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: 9,
        user: {
          steamId: 'a',
          steamUsername: 'Ada',
          steamAvatar: null,
          permissionLevel: 'ADMIN',
        },
        division: { id: 9, name: 'Premier' },
      }),
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: 9,
        user: {
          steamId: 'b',
          steamUsername: 'Bob',
          steamAvatar: null,
          permissionLevel: 'MODERATOR',
        },
        division: { id: 9, name: 'Premier' },
      }),
    ];

    const grouped = staffForLeagueFromAssignments(rows, FORMAT_2V2, 1);
    expect(grouped.map((group) => group.division.id)).toEqual([9, 5]);
    expect(grouped[0].staff.map((member) => member.name)).toEqual(['Ada', 'Bob']);
  });
});

describe('mapStaffAssignmentForDisplay', () => {
  it('flattens format, division, and region names', () => {
    expect(
      mapStaffAssignmentForDisplay({
        formatId: FORMAT_2V2,
        divisionId: 10,
        format: { id: FORMAT_2V2, name: '2v2' },
        division: {
          id: 10,
          name: 'Premier',
          regionId: 1,
          region: { id: 1, name: 'NA' },
        },
      }),
    ).toEqual({
      formatId: FORMAT_2V2,
      formatName: '2v2',
      divisionId: 10,
      divisionName: 'Premier',
      regionId: 1,
      regionName: 'NA',
    });
  });
});
