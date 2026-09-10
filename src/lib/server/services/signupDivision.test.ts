import { describe, expect, it } from 'vitest';
import { FORMAT_1V1, FORMAT_2V2 } from '$lib/server/constants/formats';
import { initialTeamPaymentStatus, signupDivisionSelectionError } from './signupDivision';

const invite = {
  id: 1,
  name: 'Invite',
  signupCost: 10,
  regionId: 4,
  formatId: FORMAT_2V2,
};

const freeOpen = {
  id: 2,
  name: 'Open',
  signupCost: 0,
  regionId: 4,
  formatId: FORMAT_2V2,
};

describe('signupDivisionSelectionError', () => {
  it('rejects a missing division', () => {
    expect(
      signupDivisionSelectionError({
        division: null,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [],
      }),
    ).toBe('Invalid division selected');
  });

  it('rejects a division from another region or format', () => {
    expect(
      signupDivisionSelectionError({
        division: invite,
        regionId: 1,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [invite.signupCost],
      }),
    ).toBe('Division does not match the selected region');

    expect(
      signupDivisionSelectionError({
        division: invite,
        regionId: 4,
        formatId: FORMAT_1V1,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [invite.signupCost],
      }),
    ).toBe('Division does not match this format');
  });

  it('requires acknowledgment only for a free division when a paid option exists', () => {
    expect(
      signupDivisionSelectionError({
        division: freeOpen,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [0, 10],
      }),
    ).toMatch(/pay to participate/i);

    expect(
      signupDivisionSelectionError({
        division: freeOpen,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: true,
        siblingSignupCosts: [0, 10],
      }),
    ).toBeNull();

    expect(
      signupDivisionSelectionError({
        division: freeOpen,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [0, 0],
      }),
    ).toBeNull();

    expect(
      signupDivisionSelectionError({
        division: invite,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
        siblingSignupCosts: [0, 10],
      }),
    ).toBeNull();
  });
});

describe('initialTeamPaymentStatus', () => {
  it('marks free divisions complimentary and paid divisions unpaid', () => {
    expect(initialTeamPaymentStatus(0)).toBe(2);
    expect(initialTeamPaymentStatus(10)).toBe(0);
  });
});
