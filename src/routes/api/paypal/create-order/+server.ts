import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPayPalOrder } from '$lib/server/services/paypal';
import { logError } from '$lib/server/utils/logger';
import { requireAuth, isAdmin } from '$lib/server/auth/permissions';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Require authentication
    requireAuth(locals.user);

    const body = await request.json();
    const { amount, currency, steamId, teams, teamId, paidForSteamIds } = body;

    if (!amount || !currency || !steamId) {
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

    const baseUrl = env.PUBLIC_URL || 'http://localhost:5173';
    const firstTeamId = teamsArray[0]!.teamId;
    const customId = teamsArray.length > 1 ? `${steamId}|multi` : `${steamId}|${firstTeamId}`;

    const result = await createPayPalOrder({
      amount,
      currency,
      steamId,
      teamId: firstTeamId,
      customId,
      returnUrl: `${baseUrl}/checkout/${steamId}`,
      cancelUrl: `${baseUrl}/checkout/${steamId}`,
    });

    if (!result.success) {
      // Log error server-side (sanitized - no sensitive data)
      await logError('PayPal create-order failed', {
        steamId,
        firstTeamId,
        amount,
        currency,
        error: result.error || 'Unknown error',
      });

      // Return generic error to client (never expose sensitive details)
      return json({ error: 'Failed to create payment order. Please try again.' }, { status: 500 });
    }

    return json(result.order);
  } catch (err) {
    // Log error server-side (sanitized)
    await logError('PayPal create-order exception', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    // Return generic error to client (never expose sensitive details)
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
