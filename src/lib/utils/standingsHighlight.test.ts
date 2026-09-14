import { describe, expect, it } from 'vitest';
import {
  compareStandingsTeams,
  defaultExpandedDivisionIds,
  isViewerStandingsTeam,
  shouldShowInDivisionStandings,
  withStandingsRanks,
} from './standingsHighlight';

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

describe('division standings order', () => {
  const ready = (wins: number, losses: number, points = 0) => ({
    status: 'READY',
    wins,
    losses,
    points,
  });
  const unready = (wins: number, losses: number, points = 0) => ({
    status: 'UNREADY',
    wins,
    losses,
    points,
  });
  const dead = (wins: number, losses: number, points = 0) => ({
    status: 'DEAD',
    wins,
    losses,
    points,
  });

  it('keeps a READY 0-3 team above 0-0 UNREADY rows', () => {
    const rows = [unready(0, 0), ready(0, 3, 1.7), ready(7, 3, 16.5), unready(0, 0)].sort(
      compareStandingsTeams,
    );
    expect(rows.map((row) => `${row.status}:${row.wins}-${row.losses}`)).toEqual([
      'READY:7-3',
      'READY:0-3',
      'UNREADY:0-0',
      'UNREADY:0-0',
    ]);
  });

  it('hides throwaway UNREADY/DEAD 0-0 rows but keeps dropouts who played', () => {
    expect(shouldShowInDivisionStandings(ready(0, 0))).toBe(true);
    expect(shouldShowInDivisionStandings(unready(0, 0))).toBe(false);
    expect(shouldShowInDivisionStandings(dead(0, 0))).toBe(false);
    expect(shouldShowInDivisionStandings(dead(0, 5))).toBe(true);
    expect(shouldShowInDivisionStandings(unready(1, 4))).toBe(true);
  });

  it('numbers only READY teams after the ranked group is sorted', () => {
    const ranked = withStandingsRanks(
      [ready(10, 1), ready(0, 5), dead(2, 3), unready(0, 1)].sort(compareStandingsTeams),
    );
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, null, null]);
  });

  it('skips rank numbers when assignRanks is false', () => {
    expect(withStandingsRanks([ready(3, 0)], false)[0]?.rank).toBeNull();
  });
});

describe('defaultExpandedDivisionIds', () => {
  it('opens every division, including Unplaced', () => {
    expect(defaultExpandedDivisionIds([{ id: 0 }, { id: 8 }, { id: 9 }])).toEqual([0, 8, 9]);
  });

  it('returns an empty list when there are no divisions', () => {
    expect(defaultExpandedDivisionIds([])).toEqual([]);
  });
});
