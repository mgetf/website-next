import { describe, expect, it } from 'vitest';
import { defaultExpandedDivisionIds, isViewerStandingsTeam } from './standingsHighlight';

const solo = { playerId: '76561198000000001', players: [{ steamId: '76561198000000001' }] };
const duo = {
  players: [{ steamId: '76561198000000001' }, { steamId: '76561198000000002' }],
};

describe('isViewerStandingsTeam', () => {
  it('returns false when logged out', () => {
    expect(isViewerStandingsTeam(solo, null, true)).toBe(false);
    expect(isViewerStandingsTeam(duo, undefined, false)).toBe(false);
  });

  it('matches a 1v1 row by playerId', () => {
    expect(isViewerStandingsTeam(solo, '76561198000000001', true)).toBe(true);
    expect(isViewerStandingsTeam(solo, '76561198000000099', true)).toBe(false);
  });

  it('matches a 2v2 row by roster steam id', () => {
    expect(isViewerStandingsTeam(duo, '76561198000000002', false)).toBe(true);
    expect(isViewerStandingsTeam(duo, '76561198000000099', false)).toBe(false);
  });

  it('does not use the 1v1 playerId path for 2v2', () => {
    expect(
      isViewerStandingsTeam(
        { playerId: '76561198000000001', players: [{ steamId: '76561198000000002' }] },
        '76561198000000001',
        false,
      ),
    ).toBe(false);
  });
});

describe('defaultExpandedDivisionIds', () => {
  const divisions = [
    { id: 0, hasViewer: false },
    { id: 8, hasViewer: false },
    { id: 9, hasViewer: false },
  ];

  it('opens the viewer division when one matches', () => {
    expect(
      defaultExpandedDivisionIds([
        { id: 0, hasViewer: false },
        { id: 8, hasViewer: false },
        { id: 9, hasViewer: true },
      ]),
    ).toEqual([9]);
  });

  it('opens the first assigned division when logged out', () => {
    expect(defaultExpandedDivisionIds(divisions)).toEqual([8]);
  });

  it('falls back to Unplaced when that is the only block', () => {
    expect(defaultExpandedDivisionIds([{ id: 0, hasViewer: false }])).toEqual([0]);
  });
});
