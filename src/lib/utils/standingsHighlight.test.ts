import { describe, expect, it } from 'vitest';
import { isViewerStandingsTeam } from './standingsHighlight';

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
