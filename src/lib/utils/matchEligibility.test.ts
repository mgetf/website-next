import { describe, expect, it } from 'vitest';
import {
  matchSetOmissionReason,
  matchSetRequiresPayment,
  placeEligibleTeams,
  type MatchSetRules,
} from './matchEligibility';

const paidSeason: MatchSetRules = {
  paymentRequired: true,
  signupCost: 10,
  seasonFormatId: 1,
};

const freeDivision: MatchSetRules = {
  paymentRequired: true,
  signupCost: 0,
  seasonFormatId: 1,
};

const paymentOff: MatchSetRules = {
  paymentRequired: false,
  signupCost: 10,
  seasonFormatId: 1,
};

const ready = { status: 'READY', paymentStatus: 0, formatId: 1 };

describe('matchSetRequiresPayment', () => {
  it('requires payment only for a paid division in a season that charges', () => {
    expect(matchSetRequiresPayment(true, 10)).toBe(true);
    expect(matchSetRequiresPayment(true, 0)).toBe(false);
    expect(matchSetRequiresPayment(false, 10)).toBe(false);
    expect(matchSetRequiresPayment(false, 0)).toBe(false);
  });
});

describe('matchSetOmissionReason', () => {
  it('keeps an unpaid ready entrant in a free division', () => {
    expect(matchSetOmissionReason(ready, freeDivision)).toBeNull();
  });

  it('keeps paid and exempt entrants in a paid division', () => {
    expect(matchSetOmissionReason({ ...ready, paymentStatus: 1 }, paidSeason)).toBeNull();
    expect(matchSetOmissionReason({ ...ready, paymentStatus: 2 }, paidSeason)).toBeNull();
  });

  it('leaves out an unpaid ready entrant in a paid division', () => {
    expect(matchSetOmissionReason(ready, paidSeason)).toBe('Unpaid in a paid division');
  });

  it('does not require payment when the season does not', () => {
    expect(matchSetOmissionReason(ready, paymentOff)).toBeNull();
  });

  it('explains status before payment', () => {
    expect(matchSetOmissionReason({ ...ready, status: 'UNREADY' }, paidSeason)).toBe('Not ready');
    expect(matchSetOmissionReason({ ...ready, status: 'PENDING' }, freeDivision)).toBe(
      'Ready-up is still pending',
    );
    expect(matchSetOmissionReason({ ...ready, status: 'PLACEMENT' }, freeDivision)).toBe(
      'Still in placement',
    );
  });

  it('explains a format mismatch and ignores dead entrants', () => {
    expect(matchSetOmissionReason({ ...ready, formatId: 2 }, freeDivision)).toBe(
      'Format does not match this season',
    );
    expect(matchSetOmissionReason({ ...ready, status: 'DEAD' }, paidSeason)).toBeNull();
  });
});

describe('placeEligibleTeams', () => {
  const teams = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it('keeps a complete pairing and assigns one bye when the field is odd', () => {
    expect(placeEligibleTeams(teams.slice(0, 3), [{ id: 1 }, { id: 2 }])).toEqual({
      paired: [{ id: 1 }, { id: 2 }],
      bye: { id: 3 },
    });
  });

  it('pairs entrants the algorithm dropped instead of leaving two byes', () => {
    expect(placeEligibleTeams(teams, [{ id: 1 }, { id: 2 }])).toEqual({
      paired: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      bye: null,
    });
  });

  it('gives the only eligible entrant a bye', () => {
    expect(placeEligibleTeams([{ id: 9 }], [])).toEqual({
      paired: [],
      bye: { id: 9 },
    });
  });
});
