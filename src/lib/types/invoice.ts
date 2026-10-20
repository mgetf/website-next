export type InvoiceMethod = 'paypal' | 'items' | 'manual';

export interface InvoicePersonSnapshot {
  steamId: string;
  name: string;
}

export interface InvoiceLineSnapshot {
  paymentId: string;
  purchasedBy: InvoicePersonSnapshot;
  purchasedFor: InvoicePersonSnapshot;
  team: { id: number; name: string } | null;
  formatName: string | null;
  regionName: string | null;
  seasonNum: number | null;
  divisionName: string | null;
  signupCost: number;
  leagueFees: number;
  total: number;
  currency: string;
  method: InvoiceMethod;
  externalId: string | null;
  itemName: string | null;
  itemQuantity: number | null;
}

export interface InvoiceRefundSnapshot {
  net: number;
  fee: number;
  refundId: string;
}

export interface InvoiceSnapshot {
  issuedAt: string;
  payer: InvoicePersonSnapshot;
  lines: InvoiceLineSnapshot[];
  currency: string | null;
  method: InvoiceMethod;
  groupKey: string | null;
  totals: {
    signupCost: number;
    leagueFees: number;
    total: number;
  };
  refund?: InvoiceRefundSnapshot;
  internalNote?: string | null;
}
