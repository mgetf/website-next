import { describe, expect, it } from 'vitest';
import { playerPaymentStatusOnApprove } from './pendingPlayers';

describe('playerPaymentStatusOnApprove', () => {
  it('keeps unplaced teams unpaid even when no fee is known', () => {
    expect(playerPaymentStatusOnApprove({ hasDivision: false, signupCost: 0, amountPaid: 0 })).toBe(
      0,
    );
    expect(
      playerPaymentStatusOnApprove({ hasDivision: false, signupCost: 10, amountPaid: 10 }),
    ).toBe(0);
  });

  it('marks free-division players as complimentary', () => {
    expect(playerPaymentStatusOnApprove({ hasDivision: true, signupCost: 0, amountPaid: 0 })).toBe(
      2,
    );
  });

  it('marks paid-division players from tracker balance', () => {
    expect(
      playerPaymentStatusOnApprove({ hasDivision: true, signupCost: 10, amountPaid: 10 }),
    ).toBe(1);
    expect(playerPaymentStatusOnApprove({ hasDivision: true, signupCost: 10, amountPaid: 0 })).toBe(
      0,
    );
  });
});
