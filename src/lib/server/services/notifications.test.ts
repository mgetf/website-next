import { describe, expect, it } from 'vitest';
import { uniqueRosterSteamIds } from './notifications';

describe('uniqueRosterSteamIds', () => {
  it('includes regular members alongside owners and admins', () => {
    expect(
      uniqueRosterSteamIds([
        { playerSteamId: 'owner' },
        { playerSteamId: 'admin' },
        { playerSteamId: 'member' },
      ]),
    ).toEqual(['owner', 'admin', 'member']);
  });

  it('dedupes a player who appears on both teams', () => {
    expect(
      uniqueRosterSteamIds([{ playerSteamId: 'shared' }, { playerSteamId: 'shared' }]),
    ).toEqual(['shared']);
  });

  it('skips the actor when provided', () => {
    expect(
      uniqueRosterSteamIds([{ playerSteamId: 'actor' }, { playerSteamId: 'teammate' }], 'actor'),
    ).toEqual(['teammate']);
  });

  it('returns an empty list when there are no players', () => {
    expect(uniqueRosterSteamIds([])).toEqual([]);
  });
});
