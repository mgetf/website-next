import { describe, expect, it } from 'vitest';
import { hasMetPaidPlayerRequirement, paidPlayersNeeded } from './rosterPayments';

describe('paidPlayersNeeded', () => {
  it('caps 2v2 all-must-pay at the current roster size', () => {
    expect(paidPlayersNeeded(3, 2)).toBe(2);
    expect(paidPlayersNeeded(3, 3)).toBe(3);
  });

  it('keeps a 2-of-3 floor for formats that allow an unpaid sub', () => {
    expect(paidPlayersNeeded(2, 2)).toBe(2);
    expect(paidPlayersNeeded(2, 3)).toBe(2);
  });

  it('returns 0 for empty rosters or invalid requirements', () => {
    expect(paidPlayersNeeded(3, 0)).toBe(0);
    expect(paidPlayersNeeded(0, 2)).toBe(0);
  });
});

describe('hasMetPaidPlayerRequirement', () => {
  it('lets a 2-player 2v2 team ready when both have paid', () => {
    expect(hasMetPaidPlayerRequirement(2, 3, 2)).toBe(true);
  });

  it('blocks a 3-player 2v2 team until the sub has paid', () => {
    expect(hasMetPaidPlayerRequirement(2, 3, 3)).toBe(false);
    expect(hasMetPaidPlayerRequirement(3, 3, 3)).toBe(true);
  });

  it('still allows an unpaid third when requiredPaidPlayers stays at 2', () => {
    expect(hasMetPaidPlayerRequirement(2, 2, 3)).toBe(true);
    expect(hasMetPaidPlayerRequirement(1, 2, 3)).toBe(false);
  });

  it('is unmet with no active players', () => {
    expect(hasMetPaidPlayerRequirement(0, 3, 0)).toBe(false);
  });
});
