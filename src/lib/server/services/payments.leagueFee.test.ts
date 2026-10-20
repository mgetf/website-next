import { describe, expect, it } from 'vitest';
import { leagueFeeForLine } from './payments';

describe('leagueFeeForLine', () => {
  it('charges the league fee once for the first unpaid line of a player in a season', () => {
    const seenFirst = new Set<string>();
    expect(
      leagueFeeForLine({
        playerSteamId: 'pepito',
        seasonId: 3,
        trackerAmount: 0,
        seenFirst,
        leagueFees: 5,
      }),
    ).toBe(5);
    expect(
      leagueFeeForLine({
        playerSteamId: 'pepito',
        seasonId: 3,
        trackerAmount: 0,
        seenFirst,
        leagueFees: 5,
      }),
    ).toBe(0);
  });

  it('skips the fee when the player already paid in that season', () => {
    expect(
      leagueFeeForLine({
        playerSteamId: 'juancito',
        seasonId: 3,
        trackerAmount: 10,
        seenFirst: new Set(),
        leagueFees: 5,
      }),
    ).toBe(0);
  });

  it('charges each player and each season separately', () => {
    const seenFirst = new Set<string>();
    expect(
      leagueFeeForLine({
        playerSteamId: 'pepito',
        seasonId: 3,
        trackerAmount: 0,
        seenFirst,
        leagueFees: 5,
      }),
    ).toBe(5);
    expect(
      leagueFeeForLine({
        playerSteamId: 'juancito',
        seasonId: 3,
        trackerAmount: 0,
        seenFirst,
        leagueFees: 5,
      }),
    ).toBe(5);
    expect(
      leagueFeeForLine({
        playerSteamId: 'pepito',
        seasonId: 4,
        trackerAmount: 0,
        seenFirst,
        leagueFees: 5,
      }),
    ).toBe(5);
  });
});
