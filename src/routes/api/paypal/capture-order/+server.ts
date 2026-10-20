import type { RequestHandler } from './$types';
import {
  capturePayPalOrder,
  isPayPalTestMode,
  isPayPalTestModeMisconfigured,
} from '#lib/server/services/paypal.js';
import {
  recordQuotedSignupPayments,
  sumQuotedAmount,
  paypalAmountsMatch,
} from '#lib/server/services/payments.js';
import { finalizePaidCartLines, getReservedQuote } from '#lib/server/services/cart.js';
import { logError } from '#lib/server/utils/logger.js';
import { requireAuth, requireNotBanned } from '#lib/server/auth/permissions.js';
import { logAudit, AuditCategory, AuditAction } from '#lib/server/services/auditLog.js';
import { paymentRateLimiter, checkRateLimit } from '#lib/server/utils/rateLimit.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const { allowed, response } = checkRateLimit(paymentRateLimiter, locals.user.steamId);
    if (!allowed && response) return response;

    if (isPayPalTestModeMisconfigured()) {
      return Response.json(
        { success: false, error: 'Payment system misconfigured. Please contact support.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { orderID } = body;

    if (!orderID) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const quoted = await getReservedQuote(locals.user.steamId);
    const amount = sumQuotedAmount(quoted);
    const currency = quoted[0]!.currency;
    const steamId = locals.user.steamId;
    const firstTeamId = quoted[0]!.teamId;

    const testData = isPayPalTestMode()
      ? {
          steamId,
          teamId: firstTeamId,
          amount,
          currency,
        }
      : undefined;

    const result = await capturePayPalOrder(orderID, testData);

    if (!result.success || !result.captureData) {
      await logError('PayPal capture-order failed', {
        orderID,
        steamId,
        error: result.error || 'Unknown error',
      });
      return Response.json(
        {
          success: false,
          error: 'Failed to capture payment. Please contact support.',
        },
        { status: 500 },
      );
    }

    const captureData = result.captureData;
    const purchase = captureData.purchase_units?.[0];
    const capture = purchase?.payments?.captures?.[0];

    if (!purchase || !capture) {
      await logError('PayPal capture-order invalid response', { orderID, steamId });
      return Response.json(
        {
          success: false,
          error: 'Invalid payment response. Please contact support.',
        },
        { status: 500 },
      );
    }

    const capturedAmount = parseFloat(capture.amount.value);
    const capturedCurrency = capture.amount.currency_code;

    if (!paypalAmountsMatch(amount, capturedAmount) || capturedCurrency !== currency) {
      await logError('PayPal capture amount mismatch', {
        orderID,
        steamId,
        expectedAmount: amount,
        expectedCurrency: currency,
        actualAmount: capturedAmount,
        actualCurrency: capturedCurrency,
      });
      return Response.json(
        {
          success: false,
          error: 'Payment amount mismatch. Please contact support.',
        },
        { status: 400 },
      );
    }

    await recordQuotedSignupPayments({
      payerSteamId: steamId,
      lines: quoted,
      currency,
      method: 'paypal',
      groupKey: capture.id,
      captureId: capture.id,
    });

    await finalizePaidCartLines(
      steamId,
      quoted.map((line) => ({ teamId: line.teamId, playerSteamId: line.playerSteamId })),
    );

    await logAudit({
      actorId: locals.user?.steamId,
      actorRole: locals.user?.permissionLevel,
      category: AuditCategory.PAYMENT,
      action: AuditAction.PAYMENT_CAPTURED,
      targetType: 'Team',
      targetId: quoted.map((line) => String(line.teamId)).join(','),
      metadata: {
        paymentId: capture.id,
        amount: capturedAmount,
        currency: capturedCurrency,
        steamId,
        lines: quoted.map((line) => ({
          teamId: line.teamId,
          playerSteamId: line.playerSteamId,
        })),
      },
      ipAddress: getClientAddress(),
    });

    return Response.json({ success: true, teamId: firstTeamId });
  } catch (err) {
    const message = getErrorMessage(err, 'Internal server error');
    const status =
      err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;

    if (status >= 500) {
      await logError('PayPal capture-order exception', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return Response.json(
      { success: false, error: status < 500 ? message : 'Internal server error' },
      { status },
    );
  }
};
