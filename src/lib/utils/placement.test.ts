import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/constants/formats';
import type { PlacementColumn, PlacementTeamContext } from '$lib/types/placement';
import {
  describePlacementMoves,
  diffPlacementMoves,
  divisionByTeamId,
  matchesPlacementSearch,
  placementAssignmentError,
  placementPaymentEffect,
} from './placement';

const invite: PlacementColumn = {
  id: 10,
  name: 'Invite',
  signupCost: 10,
  items: [
    {
      id: 1,
      name: 'Alpha',
      acronym: 'ALP',
      avatar: null,
      status: 'PENDING',
      divisionId: 10,
      players: [{ steamId: '1', steamUsername: 'alice', steamAvatar: null }],
    },
  ],
};

const open: PlacementColumn = {
  id: 20,
  name: 'Open',
  signupCost: 0,
  items: [
    {
      id: 2,
      name: 'Bravo',
      acronym: 'BRV',
      avatar: null,
      status: 'READY',
      divisionId: 20,
      players: [{ steamId: '2', steamUsername: 'bob', steamAvatar: null }],
    },
  ],
};

function team(overrides: Partial<PlacementTeamContext> = {}): PlacementTeamContext {
  return {
    id: 1,
    name: 'Alpha',
    seasonId: 5,
    regionId: 4,
    formatId: FORMAT_2V2,
    divisionId: 10,
    status: 'PENDING',
    ...overrides,
  };
}

describe('placementPaymentEffect', () => {
  it('resets payment when moving from a free division into a paid one', () => {
    expect(placementPaymentEffect(0, 10)).toBe('reset-unpaid');
  });

  it('marks players exempt when moving from a paid division into a free one', () => {
    expect(placementPaymentEffect(10, 0)).toBe('mark-exempt');
  });

  it('leaves payment alone when the cost tier does not change', () => {
    expect(placementPaymentEffect(10, 15)).toBe('none');
    expect(placementPaymentEffect(0, 0)).toBe('none');
  });
});

describe('diffPlacementMoves', () => {
  it('returns only teams whose division changed', () => {
    expect(diffPlacementMoves({ 1: 10, 2: 20 }, { 1: 20, 2: 20 })).toEqual([
      { teamId: 1, divisionId: 20 },
    ]);
  });

  it('ignores unknown teams that were not in the original snapshot', () => {
    expect(diffPlacementMoves({ 1: 10 }, { 1: 10, 99: 20 })).toEqual([]);
  });
});

describe('describePlacementMoves', () => {
  it('includes payment effects and names for each move', () => {
    const moved: PlacementColumn[] = [
      { ...invite, items: [] },
      { ...open, items: [...open.items, { ...invite.items[0], divisionId: 20 }] },
    ];
    expect(describePlacementMoves(moved, { 1: 10, 2: 20 })).toEqual([
      {
        teamId: 1,
        teamName: 'Alpha',
        fromDivisionId: 10,
        fromDivisionName: 'Invite',
        toDivisionId: 20,
        toDivisionName: 'Open',
        effect: 'mark-exempt',
        status: 'PENDING',
      },
    ]);
  });
});

describe('divisionByTeamId', () => {
  it('skips drag shadow items that do not have a numeric id', () => {
    const columns: PlacementColumn[] = [
      {
        ...invite,
        items: [...invite.items, { ...invite.items[0], id: 'shadow-1' as unknown as number }],
      },
    ];
    expect(divisionByTeamId(columns)).toEqual({ 1: 10 });
  });
});

describe('matchesPlacementSearch', () => {
  it('matches team name, acronym, or roster username', () => {
    const entry = invite.items[0];
    expect(matchesPlacementSearch(entry, 'alp')).toBe(true);
    expect(matchesPlacementSearch(entry, 'alice')).toBe(true);
    expect(matchesPlacementSearch(entry, 'zzz')).toBe(false);
    expect(matchesPlacementSearch(entry, '  ')).toBe(true);
  });
});

describe('placementAssignmentError', () => {
  const division = { id: 20, regionId: 4, formatId: FORMAT_2V2, hidden: 0 };

  it('rejects an empty batch', () => {
    expect(
      placementAssignmentError({
        assignments: [],
        teams: [],
        divisions: [],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('No placement changes to save');
  });

  it('rejects duplicate teams, missing rows, and scope mismatches', () => {
    expect(
      placementAssignmentError({
        assignments: [
          { teamId: 1, divisionId: 20 },
          { teamId: 1, divisionId: 10 },
        ],
        teams: [team()],
        divisions: [division],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('Duplicate team in placement list');

    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [],
        divisions: [division],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('One or more teams were not found');

    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [team({ regionId: 1 })],
        divisions: [division],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('One or more teams do not belong to this season, region, and format');

    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [team({ status: 'DEAD' })],
        divisions: [division],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('Withdrawn entries cannot be placed');

    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [team()],
        divisions: [{ ...division, formatId: FORMAT_1V1 }],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('Division must be in the same region and format');

    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [team()],
        divisions: [{ ...division, hidden: 1 }],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBe('Cannot place teams into a hidden division');
  });

  it('accepts a valid move', () => {
    expect(
      placementAssignmentError({
        assignments: [{ teamId: 1, divisionId: 20 }],
        teams: [team()],
        divisions: [division],
        seasonId: 5,
        regionId: 4,
        formatId: FORMAT_2V2,
      }),
    ).toBeNull();
  });
});
