export function moneyAmountLabel(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${shown} ${currency}`;
}

export function itemAmountLabel(name: string, quantity: number): string {
  if (/\bkeys?\b/i.test(name)) return `${quantity} ${quantity === 1 ? 'key' : 'keys'}`;
  return `${quantity}× ${name}`;
}

export function parseRecordedItemPayment(
  description: string,
): { quantity: number; name: string; orderNumber: string } | null {
  const match = /^Item payment - (\d+)x (.+) \(Order ([^)]+)\)$/.exec(description);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const quantity = Number(match[1]);
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return { quantity, name: match[2], orderNumber: match[3] };
}

/** Ledger ids are `${tradeOfferId}-${playerIndex}`. The order stores the trade id alone. */
export function tradeOfferIdFromItemPaymentId(paymentId: string): string | null {
  const match = /^(\d+)-\d+$/.exec(paymentId);
  return match?.[1] ?? null;
}

export function isItemLedgerCoveredByOrder(
  payment: { paymentId: string; currency: string | null; description: string | null },
  orderNumbers: ReadonlySet<string>,
  tradeOfferIds: ReadonlySet<string>,
): boolean {
  if (payment.currency !== 'ITEMS') return false;
  const recorded = parseRecordedItemPayment(payment.description ?? '');
  if (recorded && orderNumbers.has(recorded.orderNumber)) return true;
  if (tradeOfferIds.has(payment.paymentId)) return true;
  const tradeOfferId = tradeOfferIdFromItemPaymentId(payment.paymentId);
  return tradeOfferId != null && tradeOfferIds.has(tradeOfferId);
}
