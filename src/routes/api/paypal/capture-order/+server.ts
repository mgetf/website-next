import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { capturePayPalOrder, isPayPalTestMode } from '$lib/server/services/paypal';
import { recordPayPalCapture } from '$lib/server/services/payments';
import { logError } from '$lib/server/utils/logger';
import { requireAuth, isAdmin } from '$lib/server/auth/permissions';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    requireAuth(locals.user);

    const body = await request.json();
    const {
      orderID,
      steamId,
      teamId,
      amount: requestAmount,
      currency: requestCurrency,
      paidForSteamIds,
    } = body;

    if (!orderID || !steamId || !teamId) {
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (locals.user.steamId !== steamId && !isAdmin(locals.user)) {
      return json(
        { error: 'Unauthorized: Cannot capture payment for another user' },
        { status: 403 },
      );
    }

    const targets: string[] =
      Array.isArray(paidForSteamIds) && paidForSteamIds.length > 0 ? paidForSteamIds : [steamId];

    const testData = isPayPalTestMode()
      ? { steamId, teamId, amount: requestAmount, currency: requestCurrency }
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

    await recordPayPalCapture({
      payerSteamId: steamId,
      paidForSteamIds: targets,
      teamId,
      captureId: capture.id,
      amount,
      currency,
    });

    await logAudit({
      actorId: locals.user?.steamId,
      actorRole: locals.user?.permissionLevel,
      category: AuditCategory.PAYMENT,
      action: AuditAction.PAYMENT_CAPTURED,
      targetType: 'Team',
      targetId: String(teamId),
      metadata: { paymentId: capture.id, amount, currency, steamId, paidForSteamIds: targets },
      ipAddress: getClientAddress(),
    });

    return json({ success: true, teamId });
  } catch (err) {
    await logError('PayPal capture-order exception', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    return json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
};
