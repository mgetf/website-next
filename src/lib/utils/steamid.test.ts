import { describe, expect, it } from 'vitest';
import {
  steamId32FromSteamId64,
  steamId3FromSteamId64,
  steamId64FromSteamId3,
  steamId64FromSteamId32,
  steamId64FromAnyFormat,
} from './steamid';

const SAMPLE_64 = '76561198012345678';
const SAMPLE_32 = 'STEAM_0:0:26039975';
const SAMPLE_3 = '[U:1:52079950]';

describe('steamId32FromSteamId64', () => {
  it('converts a valid Steam ID 64 to Steam ID 32', () => {
    expect(steamId32FromSteamId64(SAMPLE_64)).toBe(SAMPLE_32);
  });
});

describe('steamId3FromSteamId64', () => {
  it('converts a valid Steam ID 64 to Steam ID 3', () => {
    expect(steamId3FromSteamId64(SAMPLE_64)).toBe(SAMPLE_3);
  });
});

describe('steamId64FromSteamId3', () => {
  it('converts a valid Steam ID 3 to Steam ID 64', () => {
    expect(steamId64FromSteamId3(SAMPLE_3)).toBe(SAMPLE_64);
  });

  it('returns null for invalid format', () => {
    expect(steamId64FromSteamId3('STEAM_0:0:1')).toBeNull();
    expect(steamId64FromSteamId3('[U:1:]')).toBeNull();
  });
});

describe('steamId64FromSteamId32', () => {
  it('converts a valid Steam ID 32 to Steam ID 64', () => {
    expect(steamId64FromSteamId32(SAMPLE_32)).toBe(SAMPLE_64);
  });

  it('returns null for invalid format', () => {
    expect(steamId64FromSteamId32('STEAM_0:1')).toBeNull();
    expect(steamId64FromSteamId32('not-a-steam-id')).toBeNull();
  });
});

describe('steamId64FromAnyFormat', () => {
  it('accepts raw 64-bit IDs', () => {
    expect(steamId64FromAnyFormat(`  ${SAMPLE_64}  `)).toBe(SAMPLE_64);
  });

  it('rejects 17-digit IDs below the Steam base', () => {
    expect(steamId64FromAnyFormat('76561197960265727')).toBeNull();
  });

  it('parses profile URLs', () => {
    expect(steamId64FromAnyFormat(`https://steamcommunity.com/profiles/${SAMPLE_64}`)).toBe(
      SAMPLE_64,
    );
  });

  it('parses Steam3 and Steam32 forms', () => {
    expect(steamId64FromAnyFormat(SAMPLE_3)).toBe(SAMPLE_64);
    expect(steamId64FromAnyFormat(SAMPLE_32.toLowerCase())).toBe(SAMPLE_64);
  });

  it('returns null for empty or custom URLs', () => {
    expect(steamId64FromAnyFormat('')).toBeNull();
    expect(steamId64FromAnyFormat('https://steamcommunity.com/id/custom')).toBeNull();
  });
});

describe('roundtrip', () => {
  it('roundtrips Steam32 ↔ Steam64', () => {
    expect(steamId64FromSteamId32(steamId32FromSteamId64(SAMPLE_64))).toBe(SAMPLE_64);
    expect(steamId32FromSteamId64(steamId64FromSteamId32(SAMPLE_32)!)).toBe(SAMPLE_32);
  });

  it('roundtrips Steam3 ↔ Steam64', () => {
    expect(steamId64FromSteamId3(steamId3FromSteamId64(SAMPLE_64))).toBe(SAMPLE_64);
  });
});
