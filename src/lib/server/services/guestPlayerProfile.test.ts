import { describe, expect, it } from 'vitest';
import { getGuestPlayerProfile } from './users';
import { BanStatus, UserRole } from '$lib/types/user';

describe('getGuestPlayerProfile', () => {
  it('builds a public profile for an unregistered platform player', () => {
    const profile = getGuestPlayerProfile('76561198804908666', 'DYSINAGA');

    expect(profile.player.steamId).toBe('76561198804908666');
    expect(profile.player.name).toBe('DYSINAGA');
    expect(profile.player.permissionLevel).toBe(UserRole.GUEST);
    expect(profile.player.banStatus).toBe(BanStatus.NONE);
    expect(profile.currentTeams).toEqual([]);
    expect(profile.current1v1Entry).toBeNull();
  });

  it('falls back to Unknown Player when no name is available', () => {
    expect(getGuestPlayerProfile('76561198804908666', null).player.name).toBe('Unknown Player');
  });
});
