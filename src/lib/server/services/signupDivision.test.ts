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
      }),
    ).toBe('Division does not match the selected region');

    expect(
      signupDivisionSelectionError({
        division: invite,
        regionId: 4,
        formatId: FORMAT_1V1,
        freeDivisionAcknowledged: false,
      }),
    ).toBe('Division does not match this format');
  });

  it('requires acknowledgment only for free divisions', () => {
    expect(
      signupDivisionSelectionError({
        division: freeOpen,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
      }),
    ).toMatch(/pay to participate/i);

    expect(
      signupDivisionSelectionError({
        division: freeOpen,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: true,
      }),
    ).toBeNull();

    expect(
      signupDivisionSelectionError({
        division: invite,
        regionId: 4,
        formatId: FORMAT_2V2,
        freeDivisionAcknowledged: false,
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
