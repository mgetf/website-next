import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  capturePayPalOrder,
  isPayPalTestMode,
  isPayPalTestModeMisconfigured,
} from '$lib/server/services/paypal';
import {
  recordPayPalCapture,
  recordMultiTeamPayPalCapture,
  resolvePayPalCheckoutQuote,
  paypalAmountsMatch,
} from '$lib/server/services/payments';
import { logError } from '$lib/server/utils/logger';
import { requireAuth, isAdmin, requireNotBanned } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { paymentRateLimiter, checkRateLimit } from '$lib/server/utils/rateLimit';
import { getErrorMessage } from '$lib/server/utils/errors';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const { allowed, response } = checkRateLimit(paymentRateLimiter, locals.user.steamId);
    if (!allowed && response) return response;

    if (isPayPalTestModeMisconfigured()) {
      return json(
        { success: false, error: 'Payment system misconfigured. Please contact support.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { orderID, steamId, teams, teamId, paidForSteamIds } = body;

    if (!orderID || !steamId) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Normalise to teams array; fall back to legacy single-team shape
    const teamsArray: { teamId: number; paidForSteamIds: string[] }[] =
      Array.isArray(teams) && teams.length > 0
        ? teams
        : teamId
          ? [{ teamId, paidForSteamIds: Array.isArray(paidForSteamIds) ? paidForSteamIds : [] }]
          : [];

    if (teamsArray.length === 0) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (locals.user.steamId !== steamId && !isAdmin(locals.user)) {
      return json(
        { error: 'Unauthorized: Cannot capture payment for another user' },
        { status: 403 },
      );
    }

    // Recompute expected charge server-side before accepting the capture
    const quote = await resolvePayPalCheckoutQuote(teamsArray);
    const firstTeamId = quote.teams[0]!.teamId;

    const testData = isPayPalTestMode()
      ? {
          steamId,
          teamId: firstTeamId,
          amount: quote.amount,
          currency: quote.currency,
        }
      : undefined;

    const result = await capturePayPalOrder(orderID, testData);

    if (!result.success || !result.captureData) {
      await logError('PayPal capture-order failed', {
        orderID,
        steamId,
        error: result.error || 'Unknown error',
      });
      return json(
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
      return json(
        {
          success: false,
          error: 'Invalid payment response. Please contact support.',
        },
        { status: 500 },
      );
    }

    const amount = parseFloat(capture.amount.value);
    const currency = capture.amount.currency_code;

    if (!paypalAmountsMatch(quote.amount, amount) || currency !== quote.currency) {
      await logError('PayPal capture amount mismatch', {
        orderID,
        steamId,
        expectedAmount: quote.amount,
        expectedCurrency: quote.currency,
        actualAmount: amount,
        actualCurrency: currency,
      });
      return json(
        {
          success: false,
          error: 'Payment amount mismatch. Please contact support.',
        },
        { status: 400 },
      );
    }

    if (quote.teams.length > 1) {
      await recordMultiTeamPayPalCapture({
        payerSteamId: steamId,
        teams: quote.teams,
        captureId: capture.id,
        currency,
      });
    } else {
      const single = quote.teams[0]!;

      await recordPayPalCapture({
        payerSteamId: steamId,
        paidForSteamIds: single.paidForSteamIds,
        teamId: single.teamId,
        captureId: capture.id,
        amount,
        currency,
      });
    }

    await logAudit({
      actorId: locals.user?.steamId,
      actorRole: locals.user?.permissionLevel,
      category: AuditCategory.PAYMENT,
      action: AuditAction.PAYMENT_CAPTURED,
      targetType: 'Team',
      targetId: quote.teams.map((t) => String(t.teamId)).join(','),
      metadata: {
        paymentId: capture.id,
        amount,
        currency,
        steamId,
        teams: quote.teams,
      },
      ipAddress: getClientAddress(),
    });

    return json({ success: true, teamId: firstTeamId });
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

    return json(
      { success: false, error: status < 500 ? message : 'Internal server error' },
      { status },
    );
  }
};
