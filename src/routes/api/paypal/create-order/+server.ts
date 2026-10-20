import type { RequestHandler } from './$types';
import { createPayPalOrder, isPayPalTestModeMisconfigured } from '#lib/server/services/paypal.js';
import { sumQuotedAmount } from '#lib/server/services/payments.js';
import { reserveCartLines } from '#lib/server/services/cart.js';
import { logError } from '#lib/server/utils/logger.js';
import { requireAuth, requireNotBanned } from '#lib/server/auth/permissions.js';
import { getOptionalEnv } from '#lib/server/utils/env.js';
import { paymentRateLimiter, checkRateLimit } from '#lib/server/utils/rateLimit.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const { allowed, response } = checkRateLimit(paymentRateLimiter, locals.user.steamId);
    if (!allowed && response) return response;

    if (isPayPalTestModeMisconfigured()) {
      return Response.json(
        { error: 'Payment system misconfigured. Please contact support.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const lineIds = Array.isArray(body.lineIds)
      ? body.lineIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    const quoted = await reserveCartLines(locals.user.steamId, lineIds);
    const amount = sumQuotedAmount(quoted);
    const currency = quoted[0]!.currency;
    const steamId = locals.user.steamId;

    const baseUrl = getOptionalEnv('PUBLIC_URL', 'http://localhost:5173');
    const firstTeamId = quoted[0]!.teamId;

    const result = await createPayPalOrder({
      amount,
      currency,
      steamId,
      teamId: firstTeamId,
      customId: `${steamId}|cart`,
      returnUrl: `${baseUrl}/checkout`,
      cancelUrl: `${baseUrl}/checkout`,
    });

    if (!result.success) {
      await logError('PayPal create-order failed', {
        steamId,
        amount,
        currency,
        error: result.error || 'Unknown error',
      });

      return Response.json(
        { error: 'Failed to create payment order. Please try again.' },
        { status: 500 },
      );
    }

    return Response.json({
      ...result.order,
      expectedAmount: amount,
      expectedCurrency: currency,
    });
  } catch (err) {
    const message = getErrorMessage(err, 'Internal server error');
    const status =
      err && typeof err === 'object' && 'status' in err && typeof err.status === 'number'
        ? err.status
        : 500;

    if (status >= 500) {
      await logError('PayPal create-order exception', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }

    return Response.json({ error: status < 500 ? message : 'Internal server error' }, { status });
  }
};
