import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import {
  paypalAmountsMatch,
  sumSelectedCheckoutAmount,
  type UnpaidPlayer,
} from '../services/payments';

function unpaid(overrides: Partial<UnpaidPlayer> = {}): UnpaidPlayer {
  return {
    steamId: '76561198000000001',
    name: 'player',
    avatar: null,
    signupCost: 10,
    leagueFees: 5,
    totalCost: 15,
    ...overrides,
  };
}

describe('paypalAmountsMatch', () => {
  it('compares amounts in cents', () => {
    expect(paypalAmountsMatch(10, 10)).toBe(true);
    expect(paypalAmountsMatch(10.001, 10)).toBe(true);
    expect(paypalAmountsMatch(10, 0.01)).toBe(false);
  });
});

describe('sumSelectedCheckoutAmount', () => {
  it('sums selected unpaid players', () => {
    const total = sumSelectedCheckoutAmount([
      {
        paidForSteamIds: ['76561198000000001', '76561198000000002'],
        unpaidPlayers: [
          unpaid({ steamId: '76561198000000001', totalCost: 15 }),
          unpaid({ steamId: '76561198000000002', totalCost: 10, leagueFees: 0 }),
        ],
      },
    ]);
    expect(total).toBe(25);
  });

  it('rejects players who are not unpaid on the team', () => {
    try {
      sumSelectedCheckoutAmount([
        {
          paidForSteamIds: ['76561198000000099'],
          unpaidPlayers: [unpaid()],
        },
      ]);
      expect.fail('expected badRequest');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      if (isHttpError(err)) expect(err.status).toBe(400);
    }
  });

  it('rejects empty selections', () => {
    try {
      sumSelectedCheckoutAmount([{ paidForSteamIds: [], unpaidPlayers: [unpaid()] }]);
      expect.fail('expected badRequest');
    } catch (err) {
      expect(isHttpError(err)).toBe(true);
      if (isHttpError(err)) expect(err.status).toBe(400);
    }
  });
});
