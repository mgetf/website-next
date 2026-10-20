import { Prisma, type InvoiceKind, type InvoiceStatus } from '#prisma/client.js';
import { prisma } from '#lib/server/db.js';
import { forbidden, notFound } from '#lib/server/utils/errors.js';
import { roundMoney } from './paypalRefundMath.js';
import type { InvoiceLineSnapshot, InvoiceMethod, InvoiceSnapshot } from '#lib/types/invoice.js';
import PDFDocument from 'pdfkit';
import { isAdmin } from '#lib/server/auth/permissions.js';
import type { SessionUser } from '#lib/types/user.js';

export interface RecordedPaymentForInvoice {
  paymentId: string;
  purchasedBy: string;
  purchasedByName: string;
  purchasedFor: string;
  purchasedForName: string;
  teamId: number | null;
  teamName: string | null;
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
  internalNote?: string | null;
}

function money(value: number): number {
  return roundMoney(value);
}

const PAGE_LEFT = 48;
const PAGE_RIGHT = 547;
const COL = {
  desc: { x: PAGE_LEFT, width: 250 },
  fee: { x: 298, width: 80 },
  signup: { x: 378, width: 80 },
  total: { x: 458, width: 89 },
} as const;

function drawAlignedText(
  doc: InstanceType<typeof PDFDocument>,
  text: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'right' = 'left',
) {
  doc.text(text, x, y, { width, align, lineBreak: false });
}

function toLineSnapshot(row: RecordedPaymentForInvoice): InvoiceLineSnapshot {
  return {
    paymentId: row.paymentId,
    purchasedBy: { steamId: row.purchasedBy, name: row.purchasedByName },
    purchasedFor: { steamId: row.purchasedFor, name: row.purchasedForName },
    team: row.teamId && row.teamName ? { id: row.teamId, name: row.teamName } : null,
    formatName: row.formatName,
    regionName: row.regionName,
    seasonNum: row.seasonNum,
    divisionName: row.divisionName,
    signupCost: money(row.signupCost),
    leagueFees: money(row.leagueFees),
    total: money(row.total),
    currency: row.currency,
    method: row.method,
    externalId: row.externalId,
    itemName: row.itemName,
    itemQuantity: row.itemQuantity,
  };
}

export function buildInvoiceSnapshot(
  rows: RecordedPaymentForInvoice[],
  groupKey: string | null,
): InvoiceSnapshot {
  const first = rows[0]!;
  const lines = rows.map(toLineSnapshot);
  return {
    issuedAt: new Date().toISOString(),
    payer: { steamId: first.purchasedBy, name: first.purchasedByName },
    lines,
    currency: first.currency,
    method: first.method,
    groupKey,
    totals: {
      signupCost: money(rows.reduce((sum, row) => sum + row.signupCost, 0)),
      leagueFees: money(rows.reduce((sum, row) => sum + row.leagueFees, 0)),
      total: money(rows.reduce((sum, row) => sum + row.total, 0)),
    },
    internalNote: first.internalNote ?? null,
  };
}

async function createInvoice(
  tx: Prisma.TransactionClient,
  data: {
    kind: InvoiceKind;
    paymentId?: string | null;
    groupKey?: string | null;
    creditForNumber?: string | null;
    payerSteamId: string;
    coveredSteamId?: string | null;
    teamId?: number | null;
    snapshot: InvoiceSnapshot;
  },
) {
  const prefix = data.kind === 'CREDIT_NOTE' ? 'CN' : 'INV';
  const created = await tx.invoice.create({
    data: {
      number: `${prefix}-TEMP`,
      kind: data.kind,
      status: 'ISSUED',
      paymentId: data.paymentId ?? null,
      groupKey: data.groupKey ?? null,
      creditForNumber: data.creditForNumber ?? null,
      payerSteamId: data.payerSteamId,
      coveredSteamId: data.coveredSteamId ?? null,
      teamId: data.teamId ?? null,
      snapshot: data.snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  return tx.invoice.update({
    where: { id: created.id },
    data: { number: `${prefix}-${created.id.toString().padStart(6, '0')}` },
  });
}

export async function issueInvoicesForRecordedPayments(
  tx: Prisma.TransactionClient,
  rows: RecordedPaymentForInvoice[],
  groupKey: string | null,
): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    const snapshot = buildInvoiceSnapshot([row], groupKey);
    await createInvoice(tx, {
      kind: 'LINE',
      paymentId: row.paymentId,
      groupKey,
      payerSteamId: row.purchasedBy,
      coveredSteamId: row.purchasedFor,
      teamId: row.teamId,
      snapshot,
    });
  }

  if (rows.length > 1 && groupKey) {
    const snapshot = buildInvoiceSnapshot(rows, groupKey);
    await createInvoice(tx, {
      kind: 'GROUP',
      groupKey,
      payerSteamId: rows[0]!.purchasedBy,
      teamId: null,
      snapshot,
    });
  }
}

export async function issueCreditNoteForPayment(options: {
  paymentId: string;
  net: number;
  fee: number;
  refundId: string;
}): Promise<void> {
  const invoice = await prisma.invoice.findFirst({
    where: { paymentId: options.paymentId, kind: 'LINE' },
  });
  if (!invoice) return;

  const snapshot = invoice.snapshot as unknown as InvoiceSnapshot;
  const creditSnapshot = buildCreditNoteSnapshot(snapshot, {
    net: options.net,
    fee: options.fee,
    refundId: options.refundId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });
    await createInvoice(tx, {
      kind: 'CREDIT_NOTE',
      paymentId: options.paymentId,
      creditForNumber: invoice.number,
      payerSteamId: invoice.payerSteamId,
      coveredSteamId: invoice.coveredSteamId,
      teamId: invoice.teamId,
      snapshot: creditSnapshot,
    });
  });
}

export function buildCreditNoteSnapshot(
  snapshot: InvoiceSnapshot,
  refund: { net: number; fee: number; refundId: string },
): InvoiceSnapshot {
  return {
    ...snapshot,
    issuedAt: new Date().toISOString(),
    refund: {
      net: money(refund.net),
      fee: money(refund.fee),
      refundId: refund.refundId,
    },
    totals: {
      signupCost: snapshot.totals.signupCost,
      leagueFees: snapshot.totals.leagueFees,
      total: money(refund.net),
    },
  };
}

export async function getInvoiceNumbersForPayments(paymentIds: string[], groupKeys: string[] = []) {
  if (paymentIds.length === 0 && groupKeys.length === 0) {
    return {
      lineByPayment: new Map<string, string>(),
      creditByPayment: new Map<string, string>(),
      groupByKey: new Map<string, string>(),
      groupKeyByPayment: new Map<string, string>(),
    };
  }

  const rows = await prisma.invoice.findMany({
    where: {
      OR: [
        ...(paymentIds.length > 0 ? [{ paymentId: { in: paymentIds } }] : []),
        ...(groupKeys.length > 0 ? [{ groupKey: { in: groupKeys }, kind: 'GROUP' as const }] : []),
      ],
    },
    select: { number: true, kind: true, paymentId: true, groupKey: true },
  });

  const lineByPayment = new Map<string, string>();
  const creditByPayment = new Map<string, string>();
  const groupByKey = new Map<string, string>();
  const groupKeyByPayment = new Map<string, string>();
  for (const row of rows) {
    if (row.kind === 'LINE' && row.paymentId) {
      lineByPayment.set(row.paymentId, row.number);
      if (row.groupKey) groupKeyByPayment.set(row.paymentId, row.groupKey);
    }
    if (row.kind === 'CREDIT_NOTE' && row.paymentId) creditByPayment.set(row.paymentId, row.number);
    if (row.kind === 'GROUP' && row.groupKey) groupByKey.set(row.groupKey, row.number);
  }

  const extraKeys = [
    ...new Set([...groupKeyByPayment.values()].filter((key) => !groupByKey.has(key))),
  ];
  if (extraKeys.length > 0) {
    const groups = await prisma.invoice.findMany({
      where: { kind: 'GROUP', groupKey: { in: extraKeys } },
      select: { number: true, groupKey: true },
    });
    for (const group of groups) {
      if (group.groupKey) groupByKey.set(group.groupKey, group.number);
    }
  }

  return { lineByPayment, creditByPayment, groupByKey, groupKeyByPayment };
}

export async function loadInvoiceForDownload(number: string, viewer: SessionUser | null) {
  if (!viewer) forbidden('Sign in to download this invoice');

  const invoice = await prisma.invoice.findUnique({ where: { number } });
  if (!invoice) notFound('Invoice not found');

  const allowed =
    isAdmin(viewer) ||
    viewer.steamId === invoice.payerSteamId ||
    viewer.steamId === invoice.coveredSteamId;
  if (!allowed) forbidden('You cannot download this invoice');

  return invoice;
}

export async function renderInvoicePdf(invoice: {
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issuedAt: Date;
  snapshot: InvoiceSnapshot | Prisma.JsonValue;
}): Promise<Buffer> {
  const snapshot = invoice.snapshot as InvoiceSnapshot;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title =
      invoice.kind === 'CREDIT_NOTE'
        ? 'Credit note'
        : invoice.kind === 'GROUP'
          ? 'Payment receipt'
          : 'Invoice';
    const accent = '#ea580c';
    const muted = '#71717a';
    const ink = '#18181b';

    doc.fillColor(accent).fontSize(22).font('Helvetica-Bold').text('MGE.tf');
    doc
      .fillColor(muted)
      .fontSize(10)
      .font('Helvetica')
      .text('Competitive Team Fortress 2 league', { continued: false });
    doc.moveDown(0.4);
    doc.fillColor(ink).fontSize(18).font('Helvetica-Bold').text(title);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(muted)
      .text(invoice.number)
      .text(
        invoice.issuedAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      );
    if (invoice.status === 'REFUNDED') {
      doc.fillColor('#b91c1c').font('Helvetica-Bold').text('REFUNDED');
    }

    doc.moveDown();
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('Billed to');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(ink)
      .text(snapshot.payer.name)
      .fillColor(muted)
      .text(`Steam ID ${snapshot.payer.steamId}`);

    const covered = snapshot.lines[0]?.purchasedFor;
    if (covered && covered.steamId !== snapshot.payer.steamId && snapshot.lines.length === 1) {
      doc.moveDown(0.6);
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text('Participation for');
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(ink)
        .text(covered.name)
        .fillColor(muted)
        .text(`Steam ID ${covered.steamId}`);
    }

    doc.moveDown();
    const tableTop = doc.y;
    doc
      .strokeColor('#e4e4e7')
      .lineWidth(0.5)
      .moveTo(PAGE_LEFT, tableTop)
      .lineTo(PAGE_RIGHT, tableTop)
      .stroke();
    doc.moveDown(0.4);
    const headerY = doc.y;
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8);
    drawAlignedText(doc, 'DESCRIPTION', COL.desc.x, headerY, COL.desc.width);
    drawAlignedText(doc, 'LEAGUE FEE', COL.fee.x, headerY, COL.fee.width, 'right');
    drawAlignedText(doc, 'SIGNUP', COL.signup.x, headerY, COL.signup.width, 'right');
    drawAlignedText(doc, 'TOTAL', COL.total.x, headerY, COL.total.width, 'right');
    doc.y = headerY + 12;
    doc.strokeColor('#e4e4e7').moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).stroke();

    for (const line of snapshot.lines) {
      doc.moveDown(0.45);
      const y = doc.y;
      const eventBits = [
        line.regionName,
        line.formatName,
        line.seasonNum != null ? `Season ${line.seasonNum}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const who = line.purchasedFor.name;
      const teamPart = line.team ? `${line.team.name} — ` : '';
      const division = line.divisionName ? ` · ${line.divisionName}` : '';
      const methodLabel =
        line.method === 'paypal'
          ? 'PayPal'
          : line.method === 'items'
            ? 'Steam items'
            : 'Staff record';
      doc.font('Helvetica').fontSize(9).fillColor(ink);
      doc.text(`${teamPart}${who}`, COL.desc.x, y, { width: COL.desc.width });
      doc
        .fontSize(8)
        .fillColor(muted)
        .text(`${eventBits}${division} · ${methodLabel}`, COL.desc.x, y + 12, {
          width: COL.desc.width,
        });
      const currency =
        line.currency === 'ITEMS' || line.currency === 'MANUAL' ? '' : `${line.currency} `;
      const feeLabel =
        line.method === 'items' && line.itemQuantity
          ? `${line.itemQuantity}× ${line.itemName ?? 'item'}`
          : line.method === 'manual'
            ? '—'
            : `${currency}${line.leagueFees.toFixed(2)}`;
      const signupLabel =
        line.method === 'items'
          ? '—'
          : line.method === 'manual'
            ? 'Recorded'
            : `${currency}${line.signupCost.toFixed(2)}`;
      const totalLabel =
        line.method === 'items' && line.itemQuantity
          ? `${line.itemQuantity}× ${line.itemName ?? 'item'}`
          : line.method === 'manual'
            ? 'Manual'
            : `${currency}${line.total.toFixed(2)}`;
      doc.fontSize(9).fillColor(ink);
      drawAlignedText(doc, feeLabel, COL.fee.x, y, COL.fee.width, 'right');
      drawAlignedText(doc, signupLabel, COL.signup.x, y, COL.signup.width, 'right');
      drawAlignedText(doc, totalLabel, COL.total.x, y, COL.total.width, 'right');
      doc.x = PAGE_LEFT;
      doc.y = y + 28;
    }

    doc.strokeColor('#e4e4e7').moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).stroke();
    doc.moveDown(0.6);
    const currency =
      snapshot.currency && snapshot.currency !== 'ITEMS' && snapshot.currency !== 'MANUAL'
        ? `${snapshot.currency} `
        : '';
    const totalsWidth = PAGE_RIGHT - PAGE_LEFT;
    doc.font('Helvetica').fontSize(10).fillColor(ink);
    if (snapshot.method !== 'items' && snapshot.method !== 'manual') {
      doc.text(
        `League fee  ${currency}${snapshot.totals.leagueFees.toFixed(2)}`,
        PAGE_LEFT,
        doc.y,
        {
          width: totalsWidth,
          align: 'right',
        },
      );
      doc.text(`Signup  ${currency}${snapshot.totals.signupCost.toFixed(2)}`, PAGE_LEFT, doc.y, {
        width: totalsWidth,
        align: 'right',
      });
    }
    doc.font('Helvetica-Bold').fontSize(12);
    if (invoice.kind === 'CREDIT_NOTE' && snapshot.refund) {
      doc.text(`Refunded  ${currency}${snapshot.refund.net.toFixed(2)}`, PAGE_LEFT, doc.y, {
        width: totalsWidth,
        align: 'right',
      });
      if (snapshot.refund.fee > 0) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor(muted)
          .text(
            `Payment processor fee retained  ${currency}${snapshot.refund.fee.toFixed(2)}`,
            PAGE_LEFT,
            doc.y,
            { width: totalsWidth, align: 'right' },
          );
      }
    } else if (snapshot.method === 'items') {
      const qty = snapshot.lines.reduce((sum, line) => sum + (line.itemQuantity ?? 0), 0);
      doc.text(`${qty}× ${snapshot.lines[0]?.itemName ?? 'items'}`, PAGE_LEFT, doc.y, {
        width: totalsWidth,
        align: 'right',
      });
    } else if (snapshot.method === 'manual') {
      doc
        .font('Helvetica')
        .fontSize(10)
        .text('Internal payment record', PAGE_LEFT, doc.y, { width: totalsWidth, align: 'right' });
    } else {
      doc.text(`Total  ${currency}${snapshot.totals.total.toFixed(2)}`, PAGE_LEFT, doc.y, {
        width: totalsWidth,
        align: 'right',
      });
    }

    doc.x = PAGE_LEFT;
    doc.moveDown();
    if (snapshot.groupKey) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(muted)
        .text(`Reference ${snapshot.groupKey}`, PAGE_LEFT, doc.y, { width: totalsWidth });
    }
    if (snapshot.refund?.refundId) {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(muted)
        .text(`Refund ${snapshot.refund.refundId}`, PAGE_LEFT, doc.y, { width: totalsWidth });
    }
    if (snapshot.internalNote) {
      doc.moveDown(0.4);
      doc
        .font('Helvetica-Oblique')
        .fontSize(9)
        .fillColor(muted)
        .text(snapshot.internalNote, PAGE_LEFT, doc.y, { width: totalsWidth });
    }

    doc.moveDown(1.2);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(muted)
      .text(
        'This document is a receipt for mge.tf league participation. It is not a tax invoice. Fees are charged in the currency of the league region.',
        PAGE_LEFT,
        doc.y,
        { width: totalsWidth },
      );
    doc.text('mge.tf', PAGE_LEFT, doc.y, { width: totalsWidth });

    doc.end();
  });
}
