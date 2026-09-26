import { describe, expect, it } from 'vitest';
import { buildItemPaymentDisplay, type ItemPaymentDisplayPlayer } from './item-payments';

const pepito: ItemPaymentDisplayPlayer = {
  steamId: '76561198000000001',
  name: 'pepito',
};

const juan: ItemPaymentDisplayPlayer = {
  steamId: '76561198000000002',
  name: 'juan',
};

const naSeason = {
  id: 12,
  seasonNum: 1,
  regionId: 1,
  regionName: 'North America',
  currencySymbol: '$',
  formatCode: '1v1',
  formatName: '1v1',
};

describe('buildItemPaymentDisplay', () => {
  it('describes a solo signup as region, format, and season', () => {
    const display = buildItemPaymentDisplay({
      payer: pepito,
      itemName: 'Mann Co. Supply Crate Key',
      selections: [{ teamId: 4, paidForSteamIds: [pepito.steamId] }],
      teams: [
        {
          id: 4,
          name: 'pepito',
          isIndividual: true,
          signupCost: 10,
          itemQuantity: 6,
          season: naSeason,
        },
      ],
      names: new Map([[pepito.steamId, pepito.name]]),
    });

    expect(display.payer).toEqual(pepito);
    expect(display.moneyLabel).toBe('$10');
    expect(display.spots).toEqual([
      {
        seasonLabel: 'NA 1v1 Season 1',
        leaguePath: '/leagues/1v1?season=12&region=1',
        teamName: null,
        teamPath: null,
        itemCount: 6,
        moneyLabel: '$10',
        players: [pepito],
      },
    ]);
  });

  it('keeps the team and the teammate when one player pays for a roster', () => {
    const display = buildItemPaymentDisplay({
      payer: pepito,
      itemName: 'Mann Co. Supply Crate Key',
      selections: [{ teamId: 9, paidForSteamIds: [pepito.steamId, juan.steamId] }],
      teams: [
        {
          id: 9,
          name: 'Mixup',
          isIndividual: false,
          signupCost: 8,
          itemQuantity: 4,
          season: {
            id: 3,
            seasonNum: 3,
            regionId: 2,
            regionName: 'Europe',
            currencySymbol: '€',
            formatCode: '2v2',
            formatName: '2v2',
          },
        },
      ],
      names: new Map([
        [pepito.steamId, pepito.name],
        [juan.steamId, juan.name],
      ]),
    });

    expect(display.moneyLabel).toBe('€16');
    expect(display.spots[0]).toMatchObject({
      seasonLabel: 'EU 2v2 Season 3',
      leaguePath: '/leagues/2v2?season=3&region=2',
      teamName: 'Mixup',
      teamPath: '/teams/9',
      itemCount: 8,
      players: [pepito, juan],
    });
  });

  it('omits a combined price when the signups use different currencies', () => {
    const display = buildItemPaymentDisplay({
      payer: pepito,
      itemName: 'Mann Co. Supply Crate Key',
      selections: [
        { teamId: 4, paidForSteamIds: [pepito.steamId] },
        { teamId: 9, paidForSteamIds: [pepito.steamId] },
      ],
      teams: [
        {
          id: 4,
          name: 'pepito',
          isIndividual: true,
          signupCost: 10,
          itemQuantity: 6,
          season: naSeason,
        },
        {
          id: 9,
          name: 'Mixup',
          isIndividual: false,
          signupCost: 8,
          itemQuantity: 4,
          season: {
            id: 3,
            seasonNum: 3,
            regionId: 2,
            regionName: 'Europe',
            currencySymbol: '€',
            formatCode: '2v2',
            formatName: '2v2',
          },
        },
      ],
      names: new Map([[pepito.steamId, pepito.name]]),
    });

    expect(display.moneyLabel).toBeNull();
    expect(display.spots.map((spot) => spot.moneyLabel)).toEqual(['$10', '€8']);
    expect(display.spots.map((spot) => spot.itemCount)).toEqual([6, 4]);
  });
});
