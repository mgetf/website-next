import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '#lib/server/constants/formats.js';
import {
  collapseStaffAssignments,
  mapStaffAssignmentForDisplay,
  parseStaffAssignmentTokens,
  serializeStaffAssignmentToken,
  staffForLeagueFromAssignments,
  type LeagueStaffAssignment,
} from './staffAssignments';

function assignment(
  overrides: Partial<LeagueStaffAssignment> &
    Pick<LeagueStaffAssignment, 'formatId' | 'regionId' | 'divisionId'>,
): LeagueStaffAssignment {
  const division =
    overrides.division !== undefined
      ? overrides.division
      : overrides.divisionId == null
        ? null
        : { id: overrides.divisionId, name: 'Premier', sortOrder: 0 };
  return {
    user: {
      steamId: '76561198000000000',
      steamUsername: 'Player',
      steamAvatar: null,
      permissionLevel: 'MODERATOR',
    },
    division,
    ...overrides,
  };
}

describe('parseStaffAssignmentTokens', () => {
  it('parses region, region:format, and region:format:division tokens', () => {
    expect(parseStaffAssignmentTokens(['3', `4:${FORMAT_2V2}`, `5:${FORMAT_1V1}:8`])).toEqual([
      { regionId: 3, formatId: null, divisionId: null },
      { regionId: 4, formatId: FORMAT_2V2, divisionId: null },
      { regionId: 5, formatId: FORMAT_1V1, divisionId: 8 },
    ]);
  });

  it('skips blanks and dedupes the same token', () => {
    expect(
      parseStaffAssignmentTokens([`${3}:${FORMAT_2V2}:15`, '', `${3}:${FORMAT_2V2}:15`]),
    ).toEqual([{ regionId: 3, formatId: FORMAT_2V2, divisionId: 15 }]);
  });

  it('collapses a broader token over narrower ones it already covers', () => {
    expect(parseStaffAssignmentTokens(['3', `${3}:${FORMAT_2V2}:15`])).toEqual([
      { regionId: 3, formatId: null, divisionId: null },
    ]);
    expect(parseStaffAssignmentTokens([`${3}:${FORMAT_2V2}`, `${3}:${FORMAT_2V2}:15`])).toEqual([
      { regionId: 3, formatId: FORMAT_2V2, divisionId: null },
    ]);
  });

  it('rejects malformed tokens', () => {
    expect(() => parseStaffAssignmentTokens(['3', 'nope'])).toThrow();
    expect(() => parseStaffAssignmentTokens(['3::8'])).toThrow();
  });
});

describe('collapseStaffAssignments', () => {
  it('drops scopes already covered by a broader assignment in the same region', () => {
    expect(
      collapseStaffAssignments([
        { regionId: 1, formatId: FORMAT_2V2, divisionId: 15 },
        { regionId: 1, formatId: null, divisionId: null },
        { regionId: 1, formatId: FORMAT_2V2, divisionId: null },
        { regionId: 2, formatId: FORMAT_2V2, divisionId: 9 },
      ]),
    ).toEqual([
      { regionId: 1, formatId: null, divisionId: null },
      { regionId: 2, formatId: FORMAT_2V2, divisionId: 9 },
    ]);
  });
});

describe('serializeStaffAssignmentToken', () => {
  it('writes the shortest token for each scope', () => {
    expect(serializeStaffAssignmentToken({ regionId: 3, formatId: null, divisionId: null })).toBe(
      '3',
    );
    expect(
      serializeStaffAssignmentToken({ regionId: 3, formatId: FORMAT_2V2, divisionId: null }),
    ).toBe(`3:${FORMAT_2V2}`);
    expect(
      serializeStaffAssignmentToken({ regionId: 3, formatId: FORMAT_2V2, divisionId: 15 }),
    ).toBe(`3:${FORMAT_2V2}:15`);
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
        division: { id: 10, name: 'Premier', sortOrder: 0 },
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
        division: { id: 10, name: 'Premier', sortOrder: 0 },
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
        division: { id: 20, name: 'Invite', sortOrder: 0 },
      }),
    ];

    const grouped = staffForLeagueFromAssignments(rows, FORMAT_2V2, 1, 'South America');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].division).toEqual({ id: 10, name: 'Premier' });
    expect(grouped[0].staff.map((member) => member.steamId)).toEqual(['1']);
    expect(grouped[0].staff[0].role).toBe('Head Admin');
  });

  it('sorts head admins before moderators and divisions by catalog order', () => {
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
        division: { id: 5, name: 'Open', sortOrder: 1 },
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
        division: { id: 9, name: 'Premier', sortOrder: 0 },
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
        division: { id: 9, name: 'Premier', sortOrder: 0 },
      }),
    ];

    const grouped = staffForLeagueFromAssignments(rows, FORMAT_2V2, 1, 'South America');
    expect(grouped.map((group) => group.division.id)).toEqual([9, 5]);
    expect(grouped[0].staff.map((member) => member.name)).toEqual(['Ada', 'Bob']);
  });

  it('lists format-empty and division-empty staff once under the region name', () => {
    const rows = [
      assignment({
        formatId: null,
        regionId: 1,
        divisionId: null,
        user: {
          steamId: 'region',
          steamUsername: 'RegionMod',
          steamAvatar: null,
          permissionLevel: 'MODERATOR',
        },
      }),
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: null,
        user: {
          steamId: 'format',
          steamUsername: 'FormatAdmin',
          steamAvatar: null,
          permissionLevel: 'ADMIN',
        },
      }),
      assignment({
        formatId: FORMAT_2V2,
        regionId: 1,
        divisionId: 5,
        user: {
          steamId: 'open',
          steamUsername: 'OpenMod',
          steamAvatar: null,
          permissionLevel: 'MODERATOR',
        },
        division: { id: 5, name: 'Open', sortOrder: 1 },
      }),
    ];

    const grouped = staffForLeagueFromAssignments(rows, FORMAT_2V2, 1, 'South America');
    expect(grouped.map((group) => group.division)).toEqual([
      { id: null, name: 'South America' },
      { id: 5, name: 'Open' },
    ]);
    expect(grouped[0].staff.map((member) => member.steamId)).toEqual(['format', 'region']);
    expect(grouped[1].staff.map((member) => member.steamId)).toEqual(['open']);
  });
});

describe('mapStaffAssignmentForDisplay', () => {
  it('flattens format, division, and region names', () => {
    expect(
      mapStaffAssignmentForDisplay({
        regionId: 1,
        formatId: FORMAT_2V2,
        divisionId: 10,
        region: { id: 1, name: 'NA' },
        format: { id: FORMAT_2V2, name: '2v2' },
        division: { id: 10, name: 'Premier' },
      }),
    ).toEqual({
      regionId: 1,
      regionName: 'NA',
      formatId: FORMAT_2V2,
      formatName: '2v2',
      divisionId: 10,
      divisionName: 'Premier',
    });
  });

  it('keeps format and division names empty for a region-wide assignment', () => {
    expect(
      mapStaffAssignmentForDisplay({
        regionId: 1,
        formatId: null,
        divisionId: null,
        region: { id: 1, name: 'South America' },
        format: null,
        division: null,
      }),
    ).toEqual({
      regionId: 1,
      regionName: 'South America',
      formatId: null,
      formatName: null,
      divisionId: null,
      divisionName: null,
    });
  });
});
