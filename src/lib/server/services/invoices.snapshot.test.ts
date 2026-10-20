import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildCreditNoteSnapshot,
  buildInvoiceSnapshot,
  renderInvoicePdf,
  type RecordedPaymentForInvoice,
} from './invoices';

function pdfContent(pdf: Buffer): string {
  const start = pdf.indexOf(Buffer.from('stream')) + 'stream'.length;
  const end = pdf.lastIndexOf(Buffer.from('endstream'));
  let data = pdf.subarray(start, end);
  if (data[0] === 0x0d) data = data.subarray(1);
  if (data[0] === 0x0a) data = data.subarray(1);
  const operators = inflateSync(data).toString('latin1');
  return [...operators.matchAll(/<([0-9a-fA-F]+)>/g)]
    .map(([, hex]) => Buffer.from(hex, 'hex').toString('latin1'))
    .join('');
}

function row(overrides: Partial<RecordedPaymentForInvoice> = {}): RecordedPaymentForInvoice {
  return {
    paymentId: 'CAPTURE-0',
    purchasedBy: 'pepito',
    purchasedByName: 'Pepito',
    purchasedFor: 'juancito',
    purchasedForName: 'Juancito',
    teamId: 9,
    teamName: 'Mixup',
    formatName: '2v2',
    regionName: 'Europe',
    seasonNum: 3,
    divisionName: 'Invite',
    signupCost: 8,
    leagueFees: 5,
    total: 13,
    currency: 'EUR',
    method: 'paypal',
    externalId: 'CAPTURE',
    itemName: null,
    itemQuantity: null,
    ...overrides,
  };
}

describe('buildInvoiceSnapshot', () => {
  it('keeps payer, covered player, and live-quoted totals on a line invoice', () => {
    const snapshot = buildInvoiceSnapshot([row()], 'CAPTURE');
    expect(snapshot.payer).toEqual({ steamId: 'pepito', name: 'Pepito' });
    expect(snapshot.lines).toHaveLength(1);
    expect(snapshot.lines[0]?.purchasedFor).toEqual({ steamId: 'juancito', name: 'Juancito' });
    expect(snapshot.lines[0]?.signupCost).toBe(8);
    expect(snapshot.lines[0]?.leagueFees).toBe(5);
    expect(snapshot.lines[0]?.total).toBe(13);
    expect(snapshot.totals).toEqual({ signupCost: 8, leagueFees: 5, total: 13 });
    expect(snapshot.groupKey).toBe('CAPTURE');
  });

  it('sums every line on a grouped receipt', () => {
    const snapshot = buildInvoiceSnapshot(
      [
        row(),
        row({
          paymentId: 'CAPTURE-1',
          purchasedFor: 'pepito',
          purchasedForName: 'Pepito',
          signupCost: 8,
          leagueFees: 0,
          total: 8,
        }),
      ],
      'CAPTURE',
    );
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.totals).toEqual({ signupCost: 16, leagueFees: 5, total: 21 });
  });
});

describe('renderInvoicePdf', () => {
  it('prints league fee, signup, and total column headers', async () => {
    const snapshot = buildInvoiceSnapshot(
      [row(), row({ paymentId: 'CAPTURE-1', purchasedFor: 'pepito', purchasedForName: 'Pepito' })],
      'CAPTURE',
    );
    const pdf = await renderInvoicePdf({
      number: 'INV-000007',
      kind: 'GROUP',
      status: 'ISSUED',
      issuedAt: new Date('2026-10-20T00:00:00.000Z'),
      snapshot,
    });
    const text = pdfContent(pdf);
    expect(text).toContain('DESCRIPTION');
    expect(text).toContain('LEAGUE FEE');
    expect(text).toContain('SIGNUP');
    expect(text).toContain('TOTAL');
  });
});

describe('buildCreditNoteSnapshot', () => {
  it('marks the refunded net and retained processor fee', () => {
    const invoice = buildInvoiceSnapshot([row()], 'CAPTURE');
    const credit = buildCreditNoteSnapshot(invoice, {
      net: 12.41,
      fee: 0.59,
      refundId: 'REFUND-1',
    });
    expect(credit.refund).toEqual({ net: 12.41, fee: 0.59, refundId: 'REFUND-1' });
    expect(credit.totals.total).toBe(12.41);
    expect(credit.totals.signupCost).toBe(8);
    expect(credit.totals.leagueFees).toBe(5);
  });
});
