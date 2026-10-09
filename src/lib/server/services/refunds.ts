import { Prisma } from '#prisma/client.js';
import { prisma } from '#lib/server/db.js';
import { badRequest, notFound } from '#lib/server/utils/errors.js';
import { AuditAction, AuditCategory, logAudit } from './auditLog.js';
import { syncTeamPaymentStatus } from './payments.js';
import { getPayPalCapture, isPayPalTestMode, refundPayPalCapture } from './paypal.js';
import {
  allocatePayPalFee,
  netAfterFee,
  paypalCaptureIdFromPaymentId,
  roundMoney,
} from './paypalRefundMath.js';

const REFUND_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

export interface RefundQuote {
  method: 'paypal' | 'items';
  sourceId: string;
  description: string;
  gross: number | null;
  fee: number | null;
  net: number | null;
  currency: string | null;
  itemName: string | null;
  itemQuantity: number | null;
  hasTradeOfferUrl: boolean;
  canRemoveFromTeam: boolean;
  blockReason: string | null;
}

export interface RefundRequest {
  profileSteamId: string;
  method: 'paypal' | 'items';
  sourceId: string;
  reason: string;
  markUnpaid: boolean;
  removeFromTeam: boolean;
  actorSteamId: string;
  actorRole: string | null;
  ipAddress: string | null;
}

interface RosterNotes {
  unmarked: string[];
  removed: string[];
  skippedOwners: string[];
}

function isUniqueConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function money(value: number): string {
  return roundMoney(value).toFixed(2);
}

export async function quoteRefund(
  profileSteamId: string,
  method: 'paypal' | 'items',
  sourceId: string,
): Promise<RefundQuote> {
  if (method === 'paypal') return quotePayPal(profileSteamId, sourceId);
  return quoteItems(profileSteamId, sourceId);
}

export async function requestRefund(input: RefundRequest): Promise<{ message: string }> {
  const quote = await quoteRefund(input.profileSteamId, input.method, input.sourceId);
  if (quote.blockReason) badRequest(quote.blockReason);

  if (input.method === 'paypal') return requestPayPalRefund(input, quote);
  return requestItemRefund(input, quote);
}

export async function listPendingItemRefunds() {
  const rows = await prisma.paymentRefund.findMany({
    where: { method: 'ITEMS', status: 'PENDING' },
    include: {
      player: { select: { steamUsername: true, tradeOfferUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return rows
    .filter(
      (row) =>
        row.player.tradeOfferUrl && row.itemAppId && row.itemMarketHashName && row.itemQuantity,
    )
    .map((row) => ({
      id: row.id,
      playerSteamId: row.playerSteamId,
      playerName: row.player.steamUsername,
      tradeOfferUrl: row.player.tradeOfferUrl as string,
      itemAppId: row.itemAppId as number,
      itemMarketHashName: row.itemMarketHashName as string,
      itemName: row.itemName ?? row.itemMarketHashName,
      itemQuantity: row.itemQuantity as number,
      tradeOfferId: row.tradeOfferId,
    }));
}

export async function recordItemRefundOffer(refundId: number, tradeOfferId: string): Promise<void> {
  const refund = await prisma.paymentRefund.findUnique({ where: { id: refundId } });
  if (!refund || refund.method !== 'ITEMS') notFound('Refund not found');
  if (refund.status === 'COMPLETED') return;
  if (refund.status === 'FAILED') badRequest('That refund already failed');
  if (refund.tradeOfferId && refund.tradeOfferId !== tradeOfferId) {
    badRequest('That refund already has a different trade offer');
  }
  await prisma.paymentRefund.update({
    where: { id: refundId },
    data: { tradeOfferId },
  });
}

export async function confirmItemRefund(refundId: number, tradeOfferId: string): Promise<void> {
  const refund = await prisma.paymentRefund.findUnique({ where: { id: refundId } });
  if (!refund || refund.method !== 'ITEMS') notFound('Refund not found');
  if (refund.status === 'COMPLETED') return;
  if (refund.status === 'FAILED') badRequest('That refund already failed');

  const notes = await prisma.$transaction(async (tx) => {
    await tx.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: 'COMPLETED',
        tradeOfferId,
        completedAt: new Date(),
        errorMessage: null,
      },
    });
    if (refund.itemOrderNumber) {
      await tx.itemPaymentOrder.updateMany({
        where: { orderNumber: refund.itemOrderNumber },
        data: { status: 'REFUNDED' },
      });
    }
    return applyRosterEffects(tx, refund);
  });

  await logAudit({
    actorId: refund.actorSteamId,
    category: AuditCategory.PAYMENT,
    action: AuditAction.ITEM_REFUND_COMPLETED,
    targetType: 'PaymentRefund',
    targetId: String(refundId),
    metadata: {
      itemOrderNumber: refund.itemOrderNumber,
      tradeOfferId,
      playerSteamId: refund.playerSteamId,
      unmarked: notes.unmarked.join(','),
      removed: notes.removed.join(','),
      skippedOwners: notes.skippedOwners.join(','),
    },
  });
}

export async function failItemRefund(refundId: number, errorMessage: string): Promise<void> {
  const refund = await prisma.paymentRefund.findUnique({ where: { id: refundId } });
  if (!refund || refund.method !== 'ITEMS') notFound('Refund not found');
  if (refund.status !== 'PENDING') return;
  if (refund.tradeOfferId) return;

  await prisma.paymentRefund.update({
    where: { id: refundId },
    data: { status: 'FAILED', errorMessage: errorMessage.slice(0, 500) },
  });

  await logAudit({
    actorId: refund.actorSteamId,
    category: AuditCategory.PAYMENT,
    action: AuditAction.ITEM_REFUND_FAILED,
    targetType: 'PaymentRefund',
    targetId: String(refundId),
    metadata: {
      itemOrderNumber: refund.itemOrderNumber,
      playerSteamId: refund.playerSteamId,
      error: errorMessage.slice(0, 300),
    },
  });
}

async function quotePayPal(profileSteamId: string, paymentId: string): Promise<RefundQuote> {
  const payment = await prisma.payment.findFirst({
    where: { paymentId, purchasedBy: profileSteamId },
    include: { team: { select: { name: true } } },
  });
  if (!payment) notFound('Payment not found');
  if (payment.currency === 'ITEMS' || payment.currency === 'MANUAL') {
    return emptyQuote('paypal', paymentId, 'That payment cannot be refunded from here.');
  }

  const user = await prisma.user.findUnique({
    where: { steamId: profileSteamId },
    select: { tradeOfferUrl: true },
  });
  const blockReason = await paypalBlockReason(payment.paymentId, payment.purchaseDate);
  const targets = [payment.purchasedFor];
  const canRemove = payment.teamId ? await canRemoveAny(payment.teamId, targets) : false;

  if (blockReason) {
    return {
      ...emptyQuote('paypal', paymentId, blockReason),
      description: payment.description ?? payment.team?.name ?? 'PayPal payment',
      hasTradeOfferUrl: Boolean(user?.tradeOfferUrl),
      canRemoveFromTeam: canRemove,
    };
  }

  const captureId = payment.paypalCaptureId ?? paypalCaptureIdFromPaymentId(payment.paymentId);
  const loaded = await getPayPalCapture(captureId);
  if (!loaded.success || !loaded.capture) {
    return {
      ...emptyQuote('paypal', paymentId, loaded.error ?? 'Could not load the PayPal payment'),
      description: payment.description ?? '',
      hasTradeOfferUrl: Boolean(user?.tradeOfferUrl),
      canRemoveFromTeam: canRemove,
    };
  }

  const rowGross = parseFloat(payment.amount);
  const captureGross = isPayPalTestMode() ? rowGross : loaded.capture.gross;
  const captureFee = isPayPalTestMode() ? 0 : loaded.capture.fee;
  const allocated = await feeAlreadyAllocated(captureId, payment.paymentId);
  const fee = allocatePayPalFee({
    rowGross,
    captureGross,
    captureFee,
    alreadyAllocatedFee: allocated.fee,
    isLastRow: allocated.isLast,
  });
  const net = netAfterFee(rowGross, fee);

  return {
    method: 'paypal',
    sourceId: paymentId,
    description: payment.description ?? payment.team?.name ?? 'PayPal payment',
    gross: roundMoney(rowGross),
    fee,
    net,
    currency: payment.currency ?? loaded.capture.currency,
    itemName: null,
    itemQuantity: null,
    hasTradeOfferUrl: Boolean(user?.tradeOfferUrl),
    canRemoveFromTeam: canRemove,
    blockReason: net <= 0 ? 'There is nothing left to refund on this payment.' : null,
  };
}

async function quoteItems(profileSteamId: string, orderNumber: string): Promise<RefundQuote> {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: { orderNumber, playerSteamId: profileSteamId },
    include: { team: { select: { name: true } } },
  });
  if (!order) notFound('Item payment not found');

  const user = await prisma.user.findUnique({
    where: { steamId: profileSteamId },
    select: { tradeOfferUrl: true },
  });
  const targets = order.paidForSteamIds.length > 0 ? order.paidForSteamIds : [order.playerSteamId];
  const canRemove = await canRemoveAny(order.teamId, targets);
  let blockReason: string | null = null;
  if (order.status !== 'COMPLETED') blockReason = 'Only a completed item payment can be refunded.';
  else if (await hasOpenRefund({ itemOrderNumber: orderNumber })) {
    blockReason = 'This payment already has a refund.';
  } else if (!user?.tradeOfferUrl) {
    blockReason = 'This player has not saved a Steam trade offer link.';
  }

  return {
    method: 'items',
    sourceId: orderNumber,
    description: `${order.itemsRequired}x ${order.itemName}`,
    gross: null,
    fee: null,
    net: null,
    currency: 'ITEMS',
    itemName: order.itemName,
    itemQuantity: order.itemsRequired,
    hasTradeOfferUrl: Boolean(user?.tradeOfferUrl),
    canRemoveFromTeam: canRemove,
    blockReason,
  };
}

async function requestPayPalRefund(
  input: RefundRequest,
  quote: RefundQuote,
): Promise<{ message: string }> {
  const payment = await prisma.payment.findFirst({
    where: { paymentId: input.sourceId, purchasedBy: input.profileSteamId },
  });
  if (
    !payment ||
    quote.net == null ||
    quote.fee == null ||
    quote.gross == null ||
    !quote.currency
  ) {
    badRequest('That payment cannot be refunded.');
  }

  const captureId = payment.paypalCaptureId ?? paypalCaptureIdFromPaymentId(payment.paymentId);
  const targets = [payment.purchasedFor];
  let refundId: number;
  try {
    const created = await prisma.paymentRefund.create({
      data: {
        method: 'PAYPAL',
        status: 'PENDING',
        playerSteamId: input.profileSteamId,
        teamId: payment.teamId,
        paymentId: payment.paymentId,
        grossAmount: money(quote.gross),
        feeAmount: money(quote.fee),
        refundAmount: money(quote.net),
        currency: quote.currency,
        paypalCaptureId: captureId,
        markUnpaid: input.markUnpaid,
        removeFromTeam: input.removeFromTeam,
        targetSteamIds: targets,
        reason: input.reason,
        actorSteamId: input.actorSteamId,
      },
    });
    refundId = created.id;
  } catch (err) {
    if (isUniqueConflict(err)) badRequest('This payment already has a refund.');
    throw err;
  }

  const paypal = await refundPayPalCapture({
    captureId,
    amount: money(quote.net),
    currency: quote.currency,
    note: 'mge.tf signup refund',
  });

  if (!paypal.success || !paypal.refundId) {
    const errorMessage = paypal.error ?? 'PayPal refused the refund';
    await prisma.paymentRefund.update({
      where: { id: refundId },
      data: { status: 'FAILED', errorMessage },
    });
    await logAudit({
      actorId: input.actorSteamId,
      actorRole: input.actorRole,
      category: AuditCategory.PAYMENT,
      action: AuditAction.PAYMENT_REFUND_FAILED,
      targetType: 'Payment',
      targetId: payment.paymentId,
      metadata: { error: errorMessage, captureId },
      ipAddress: input.ipAddress,
    });
    badRequest(errorMessage);
  }

  let notes: RosterNotes;
  try {
    notes = await prisma.$transaction(async (tx) => {
      await tx.paymentRefund.update({
        where: { id: refundId },
        data: {
          status: 'COMPLETED',
          paypalRefundId: paypal.refundId,
          completedAt: new Date(),
        },
      });
      return applyRosterEffects(tx, {
        teamId: payment.teamId,
        markUnpaid: input.markUnpaid,
        removeFromTeam: input.removeFromTeam,
        targetSteamIds: targets,
      });
    });
  } catch (err) {
    await prisma.paymentRefund.update({
      where: { id: refundId },
      data: {
        status: 'COMPLETED',
        paypalRefundId: paypal.refundId,
        completedAt: new Date(),
        errorMessage: 'PayPal refunded the payment. The roster update did not finish.',
      },
    });
    await logAudit({
      actorId: input.actorSteamId,
      actorRole: input.actorRole,
      category: AuditCategory.PAYMENT,
      action: AuditAction.PAYMENT_REFUNDED,
      targetType: 'Payment',
      targetId: payment.paymentId,
      metadata: {
        captureId,
        paypalRefundId: paypal.refundId,
        rosterFailed: true,
        error: err instanceof Error ? err.message : 'roster update failed',
      },
      ipAddress: input.ipAddress,
    });
    badRequest(
      'PayPal refunded the payment, but the roster update failed. Check the team before trying again.',
    );
  }

  await logAudit({
    actorId: input.actorSteamId,
    actorRole: input.actorRole,
    category: AuditCategory.PAYMENT,
    action: AuditAction.PAYMENT_REFUNDED,
    targetType: 'Payment',
    targetId: payment.paymentId,
    metadata: {
      captureId,
      paypalRefundId: paypal.refundId,
      gross: money(quote.gross),
      fee: money(quote.fee),
      net: money(quote.net),
      currency: quote.currency,
      reason: input.reason,
      unmarked: notes.unmarked.join(','),
      removed: notes.removed.join(','),
      skippedOwners: notes.skippedOwners.join(','),
    },
    ipAddress: input.ipAddress,
  });

  return { message: refundMessage(quote.currency, quote.net, notes) };
}

async function requestItemRefund(
  input: RefundRequest,
  quote: RefundQuote,
): Promise<{ message: string }> {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: { orderNumber: input.sourceId, playerSteamId: input.profileSteamId },
  });
  if (!order) badRequest('That payment cannot be refunded.');
  const targets = order.paidForSteamIds.length > 0 ? order.paidForSteamIds : [order.playerSteamId];

  try {
    const created = await prisma.paymentRefund.create({
      data: {
        method: 'ITEMS',
        status: 'PENDING',
        playerSteamId: input.profileSteamId,
        teamId: order.teamId,
        itemOrderNumber: order.orderNumber,
        itemName: order.itemName,
        itemAppId: order.itemAppId,
        itemMarketHashName: order.itemMarketHashName,
        itemQuantity: order.itemsRequired,
        markUnpaid: input.markUnpaid,
        removeFromTeam: input.removeFromTeam,
        targetSteamIds: targets,
        reason: input.reason,
        actorSteamId: input.actorSteamId,
      },
    });
    await logAudit({
      actorId: input.actorSteamId,
      actorRole: input.actorRole,
      category: AuditCategory.PAYMENT,
      action: AuditAction.ITEM_REFUND_REQUESTED,
      targetType: 'ItemPaymentOrder',
      targetId: order.orderNumber,
      metadata: {
        refundId: created.id,
        itemName: order.itemName,
        itemQuantity: order.itemsRequired,
        reason: input.reason,
        markUnpaid: input.markUnpaid,
        removeFromTeam: input.removeFromTeam,
      },
      ipAddress: input.ipAddress,
    });
  } catch (err) {
    if (isUniqueConflict(err)) badRequest('This payment already has a refund.');
    throw err;
  }

  const label =
    quote.itemQuantity && quote.itemName ? `${quote.itemQuantity}x ${quote.itemName}` : 'the items';
  return {
    message: `Refund queued. The Steam bot will offer ${label}. Roster changes wait until that trade is sent.`,
  };
}

async function paypalBlockReason(paymentId: string, purchaseDate: Date): Promise<string | null> {
  if (Date.now() - purchaseDate.getTime() > REFUND_WINDOW_MS) {
    return 'PayPal only allows refunds within 180 days of the payment.';
  }
  if (await hasOpenRefund({ paymentId })) return 'This payment already has a refund.';
  return null;
}

async function hasOpenRefund(
  where: { paymentId: string } | { itemOrderNumber: string },
): Promise<boolean> {
  const existing = await prisma.paymentRefund.findFirst({
    where: { ...where, status: { in: ['PENDING', 'COMPLETED'] } },
    select: { id: true },
  });
  return existing != null;
}

async function feeAlreadyAllocated(
  captureId: string,
  paymentId: string,
): Promise<{ fee: number; isLast: boolean }> {
  const siblings = await prisma.payment.findMany({
    where: {
      OR: [{ paypalCaptureId: captureId }, { paymentId: { startsWith: `${captureId}-` } }],
    },
    select: { paymentId: true, paypalCaptureId: true },
  });
  const ids = siblings
    .filter(
      (row) => (row.paypalCaptureId ?? paypalCaptureIdFromPaymentId(row.paymentId)) === captureId,
    )
    .map((row) => row.paymentId);

  const refunds = await prisma.paymentRefund.findMany({
    where: { paymentId: { in: ids }, status: 'COMPLETED' },
    select: { paymentId: true, feeAmount: true },
  });
  const refunded = new Set(refunds.map((row) => row.paymentId));
  const open = ids.filter((id) => !refunded.has(id));
  const fee = refunds.reduce((sum, row) => sum + parseFloat(row.feeAmount ?? '0'), 0);
  return { fee, isLast: open.length === 1 && open[0] === paymentId };
}

async function canRemoveAny(teamId: number, steamIds: string[]): Promise<boolean> {
  const rows = await prisma.playerInTeam.findMany({
    where: { teamId, playerSteamId: { in: steamIds }, active: 1 },
    select: { permissionLevel: true },
  });
  return rows.some((row) => row.permissionLevel !== 2);
}

async function applyRosterEffects(
  tx: Prisma.TransactionClient,
  refund: {
    teamId: number | null;
    markUnpaid: boolean;
    removeFromTeam: boolean;
    targetSteamIds: string[];
  },
): Promise<RosterNotes> {
  const notes: RosterNotes = { unmarked: [], removed: [], skippedOwners: [] };
  if (!refund.teamId || refund.targetSteamIds.length === 0) return notes;
  if (!refund.markUnpaid && !refund.removeFromTeam) return notes;

  const team = await tx.team.findUnique({
    where: { id: refund.teamId },
    include: {
      division: { select: { signupCost: true } },
      format: { select: { requiredPaidPlayers: true } },
    },
  });
  if (!team) return notes;

  const signupCost = team.division?.signupCost ?? 0;
  for (const steamId of refund.targetSteamIds) {
    const membership = await tx.playerInTeam.findUnique({
      where: { playerSteamId_teamId: { playerSteamId: steamId, teamId: team.id } },
    });
    if (!membership || membership.active !== 1) continue;

    if (refund.markUnpaid && membership.paymentStatus !== 0) {
      await tx.playerInTeam.update({
        where: { playerSteamId_teamId: { playerSteamId: steamId, teamId: team.id } },
        data: { paymentStatus: 0 },
      });
      if (team.seasonId && signupCost > 0) {
        await tx.paymentTracker.updateMany({
          where: { playerSteamId: steamId, seasonId: team.seasonId, amount: { gte: signupCost } },
          data: { amount: { decrement: signupCost } },
        });
      }
      notes.unmarked.push(steamId);
    }

    if (refund.removeFromTeam) {
      if (membership.permissionLevel === 2) {
        notes.skippedOwners.push(steamId);
        continue;
      }
      await tx.playerInTeam.update({
        where: { playerSteamId_teamId: { playerSteamId: steamId, teamId: team.id } },
        data: { active: 0, permissionLevel: -2, leftAt: new Date() },
      });
      notes.removed.push(steamId);
    }
  }

  await syncTeamPaymentStatus(tx, team.id, team.format.requiredPaidPlayers);
  return notes;
}

function emptyQuote(
  method: 'paypal' | 'items',
  sourceId: string,
  blockReason: string,
): RefundQuote {
  return {
    method,
    sourceId,
    description: '',
    gross: null,
    fee: null,
    net: null,
    currency: null,
    itemName: null,
    itemQuantity: null,
    hasTradeOfferUrl: false,
    canRemoveFromTeam: false,
    blockReason,
  };
}

function refundMessage(currency: string, net: number, notes: RosterNotes): string {
  const symbol = currency === 'EUR' ? '€' : '$';
  const parts = [`PayPal refunded ${symbol}${money(net)} ${currency}.`];
  if (notes.skippedOwners.length > 0) parts.push('The team owner stayed on the roster.');
  return parts.join(' ');
}
