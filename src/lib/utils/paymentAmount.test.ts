import { describe, expect, it } from 'vitest';
import {
  isItemLedgerCoveredByOrder,
  itemAmountLabel,
  moneyAmountLabel,
  parseRecordedItemPayment,
  tradeOfferIdFromItemPaymentId,
} from './paymentAmount';

describe('payment amount labels', () => {
  it('prints whole money amounts with the currency code', () => {
    expect(moneyAmountLabel('10.00', 'USD')).toBe('10 USD');
    expect(moneyAmountLabel('10.5', 'EUR')).toBe('10.50 EUR');
    expect(moneyAmountLabel('12', 'AUD')).toBe('12 AUD');
  });

  it('shortens crate keys and keeps other item names', () => {
    expect(itemAmountLabel('Mann Co. Supply Crate Key', 3)).toBe('3 keys');
    expect(itemAmountLabel('Mann Co. Supply Crate Key', 1)).toBe('1 key');
    expect(itemAmountLabel('Refined Metal', 2)).toBe('2× Refined Metal');
  });

  it('reads quantity and name from a recorded item payment', () => {
    expect(
      parseRecordedItemPayment('Item payment - 3x Mann Co. Supply Crate Key (Order IP-00194)'),
    ).toEqual({ quantity: 3, name: 'Mann Co. Supply Crate Key', orderNumber: 'IP-00194' });
    expect(parseRecordedItemPayment('Team signup payment')).toBeNull();
  });

  it('reads the trade offer id from a per-player ledger id', () => {
    expect(tradeOfferIdFromItemPaymentId('9393692481-0')).toBe('9393692481');
    expect(tradeOfferIdFromItemPaymentId('9393692481')).toBeNull();
  });

  it('hides the ledger row when the item order is already listed', () => {
    const orders = new Set(['IP-00206']);
    const trades = new Set(['9393692481']);
    const ledger = {
      paymentId: '9393692481-0',
      currency: 'ITEMS',
      description: 'Item payment - 3x Mann Co. Supply Crate Key (Order IP-00206)',
    };
    expect(isItemLedgerCoveredByOrder(ledger, orders, trades)).toBe(true);
    expect(
      isItemLedgerCoveredByOrder(
        { ...ledger, currency: 'USD', description: 'Team signup' },
        orders,
        trades,
      ),
    ).toBe(false);
  });
});
