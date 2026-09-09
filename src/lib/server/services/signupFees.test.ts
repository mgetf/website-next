import { describe, expect, it } from 'vitest';
import { buildSignupFeeSummary, summarizeRegionFee, type DivisionFeeInput } from './signupFees';

const naInvite: DivisionFeeInput = {
  regionId: 1,
  signupCost: 10,
  currencySymbol: '$',
  itemQuantity: 6,
  itemName: 'Mann Co. Supply Crate Key',
};

const naNewcomer: DivisionFeeInput = {
  regionId: 1,
  signupCost: 0,
  currencySymbol: '$',
  itemQuantity: null,
  itemName: null,
};

const asiaInvite: DivisionFeeInput = {
  regionId: 5,
  signupCost: 4,
  currencySymbol: '$',
  itemQuantity: 2,
  itemName: 'Mann Co. Supply Crate Key',
};

const euInvite: DivisionFeeInput = {
  regionId: 2,
  signupCost: 8,
  currencySymbol: '€',
  itemQuantity: null,
  itemName: null,
};

describe('summarizeRegionFee', () => {
  it('is free when the season does not require payment', () => {
    expect(summarizeRegionFee(false, [naInvite])).toEqual({
      kind: 'free',
      moneyLabel: null,
      itemLabel: null,
    });
  });

  it('is free when paid-required divisions are all zero-cost with no item alt', () => {
    expect(summarizeRegionFee(true, [naNewcomer])).toEqual({
      kind: 'free',
      moneyLabel: null,
      itemLabel: null,
    });
  });

  it('uses configured money and item amounts, omitting zero-cost divisions', () => {
    expect(summarizeRegionFee(true, [naInvite, naNewcomer])).toEqual({
      kind: 'paid',
      moneyLabel: '$10',
      itemLabel: '6× Mann Co. Supply Crate Key',
    });
  });

  it('ranges same-currency paid amounts within one region', () => {
    expect(summarizeRegionFee(true, [naInvite, asiaInvite])).toEqual({
      kind: 'paid',
      moneyLabel: '$4–$10',
      itemLabel: '2–6× Mann Co. Supply Crate Key',
    });
  });
});

describe('buildSignupFeeSummary', () => {
  it('lists each region instead of collapsing prices into one line', () => {
    expect(
      buildSignupFeeSummary([
        {
          regionId: 5,
          name: 'Asia',
          paymentRequired: true,
          divisions: [asiaInvite],
        },
        {
          regionId: 1,
          name: 'North America',
          paymentRequired: true,
          divisions: [naInvite, naNewcomer],
        },
        {
          regionId: 2,
          name: 'Europe',
          paymentRequired: false,
          divisions: [euInvite],
        },
      ]),
    ).toEqual({
      regions: [
        {
          regionId: 1,
          name: 'North America',
          abbr: 'NA',
          flagCode: 'us',
          kind: 'paid',
          moneyLabel: '$10',
          itemLabel: '6× Mann Co. Supply Crate Key',
        },
        {
          regionId: 2,
          name: 'Europe',
          abbr: 'EU',
          flagCode: 'eu',
          kind: 'free',
          moneyLabel: null,
          itemLabel: null,
        },
        {
          regionId: 5,
          name: 'Asia',
          abbr: 'ASIA',
          flagCode: 'sg',
          kind: 'paid',
          moneyLabel: '$4',
          itemLabel: '2× Mann Co. Supply Crate Key',
        },
      ],
    });
  });
});
