import { describe, expect, it } from 'vitest';
import { buildUnregisteredPlayerProfile } from './unregisteredProfile';

const STEAM_ID = '76561198012345678';

describe('buildUnregisteredPlayerProfile', () => {
  it('uses the Steam persona and keeps league history empty', () => {
    const profile = buildUnregisteredPlayerProfile(STEAM_ID, {
      personaname: 'Advanti',
      avatarfull: 'https://avatars.steamstatic.com/example.jpg',
    });

    expect(profile.registered).toBe(false);
    expect(profile.player).toMatchObject({
      steamId: STEAM_ID,
      name: 'Advanti',
      avatar: 'https://avatars.steamstatic.com/example.jpg',
      discordLinked: false,
      discordUsername: null,
      permissionLevel: 'GUEST',
    });
    expect(profile.currentTeams).toEqual([]);
    expect(profile.teamHistory).toEqual([]);
    expect(profile.entries1v1).toEqual([]);
    expect(profile.current1v1Entry).toBeNull();
    expect(profile.achievements).toEqual([]);
    expect(profile.tournaments).toEqual([]);
    expect(profile.fightNights).toEqual([]);
  });

  it('falls back when Steam has no public profile', () => {
    const profile = buildUnregisteredPlayerProfile(STEAM_ID, null);

    expect(profile.registered).toBe(false);
    expect(profile.player.name).toBe('Unknown player');
    expect(profile.player.avatar).toBeNull();
  });
});
