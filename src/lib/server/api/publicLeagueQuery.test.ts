import { describe, expect, it } from 'vitest';
import {
  PublicQueryError,
  parseMatchListQuery,
  parseSeasonListQuery,
  parseTeamListQuery,
  pathSteamId,
} from './publicLeagueQuery';

describe('public league query', () => {
  it('reads season filters', () => {
    const query = parseSeasonListQuery(
      new URLSearchParams('regionId=2&format=1v1&current=true&page=3'),
    );
    expect(query).toEqual({ regionId: 2, format: '1v1', current: true, page: 3 });
  });

  it('rejects an unknown match status and a short steam id', () => {
    expect(() => parseMatchListQuery(new URLSearchParams('status=locked'))).toThrow(
      PublicQueryError,
    );
    expect(() => parseMatchListQuery(new URLSearchParams('player=7656'))).toThrow(PublicQueryError);
    expect(
      parseMatchListQuery(
        new URLSearchParams('player=76561198000000000&status=unplayed&teamId=44'),
      ),
    ).toMatchObject({
      player: '76561198000000000',
      status: 'unplayed',
      teamId: 44,
      page: 1,
    });
  });

  it('rejects team status outside the league enum', () => {
    expect(() => parseTeamListQuery(new URLSearchParams('status=banned'))).toThrow(
      PublicQueryError,
    );
    expect(parseTeamListQuery(new URLSearchParams('status=READY&seasonId=12')).status).toBe(
      'ready',
    );
  });

  it('requires a 17-digit steam id on the player route', () => {
    expect(pathSteamId('76561198000000000')).toBe('76561198000000000');
    expect(() => pathSteamId('STEAM_0:1:1')).toThrow(PublicQueryError);
  });
});
