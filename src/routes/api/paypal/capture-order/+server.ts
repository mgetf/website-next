import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { capturePayPalOrder, isPayPalTestMode } from '$lib/server/services/paypal';
import { recordPayPalCapture, recordMultiTeamPayPalCapture } from '$lib/server/services/payments';
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
      teams,
      teamId,
      amount: requestAmount,
      currency: requestCurrency,
      paidForSteamIds,
    } = body;

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

    const firstTeamId = teamsArray[0]!.teamId;

    const testData = isPayPalTestMode()
      ? { steamId, teamId: firstTeamId, amount: requestAmount, currency: requestCurrency }
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

    if (teamsArray.length > 1) {
      await recordMultiTeamPayPalCapture({
        payerSteamId: steamId,
        teams: teamsArray,
        captureId: capture.id,
        currency,
      });
    } else {
      const single = teamsArray[0]!;
      const targets: string[] =
        single.paidForSteamIds.length > 0 ? single.paidForSteamIds : [steamId];

      await recordPayPalCapture({
        payerSteamId: steamId,
        paidForSteamIds: targets,
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
      targetId: teamsArray.map((t) => String(t.teamId)).join(','),
      metadata: {
        paymentId: capture.id,
        amount,
        currency,
        steamId,
        teams: teamsArray,
      },
      ipAddress: getClientAddress(),
    });

    return json({ success: true, teamId: firstTeamId });
  } catch (err) {
    await logError('PayPal capture-order exception', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    return json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
};
