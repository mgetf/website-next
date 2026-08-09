import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPayPalOrder, isPayPalTestModeMisconfigured } from '$lib/server/services/paypal';
import { resolvePayPalCheckoutQuote } from '$lib/server/services/payments';
import { logError } from '$lib/server/utils/logger';
import { requireAuth, isAdmin, requireNotBanned } from '$lib/server/auth/permissions';
import { getOptionalEnv } from '$lib/server/utils/env';
import { paymentRateLimiter, checkRateLimit } from '$lib/server/utils/rateLimit';
import { getErrorMessage } from '$lib/server/utils/errors';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const { allowed, response } = checkRateLimit(paymentRateLimiter, locals.user.steamId);
    if (!allowed && response) return response;

    if (isPayPalTestModeMisconfigured()) {
      return json(
        { error: 'Payment system misconfigured. Please contact support.' },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { currency: _ignoredCurrency, steamId, teams, teamId, paidForSteamIds } = body;

    if (!steamId) {
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
        { error: 'Unauthorized: Cannot create payment for another user' },
        { status: 403 },
      );
    }

    // Server-compute the charge — never trust client amount/currency
    const quote = await resolvePayPalCheckoutQuote(teamsArray);

    const baseUrl = getOptionalEnv('PUBLIC_URL', 'http://localhost:5173');
    const firstTeamId = quote.teams[0]!.teamId;
    const customId = quote.teams.length > 1 ? `${steamId}|multi` : `${steamId}|${firstTeamId}`;

    const result = await createPayPalOrder({
      amount: quote.amount,
      currency: quote.currency,
      steamId,
      teamId: firstTeamId,
      customId,
      returnUrl: `${baseUrl}/checkout/${steamId}`,
      cancelUrl: `${baseUrl}/checkout/${steamId}`,
    });

    if (!result.success) {
      await logError('PayPal create-order failed', {
        steamId,
        firstTeamId,
        amount: quote.amount,
        currency: quote.currency,
        error: result.error || 'Unknown error',
      });

      return json({ error: 'Failed to create payment order. Please try again.' }, { status: 500 });
    }

    return json({
      ...result.order,
      // Echo server quote so the client can assert before capture
      expectedAmount: quote.amount,
      expectedCurrency: quote.currency,
      resolvedTeams: quote.teams,
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

    return json({ error: status < 500 ? message : 'Internal server error' }, { status });
  }
};
