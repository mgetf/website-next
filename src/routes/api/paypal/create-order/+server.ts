import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createPayPalOrder, getPayPalConfig } from '$lib/server/services/paypal';
import { logError } from '$lib/server/utils/logger';
import { requireAuth, isAdmin } from '$lib/server/auth/permissions';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Require authentication
		requireAuth(locals.user);

		const body = await request.json();
		const { amount, currency, steamId, teamId } = body;

		// Validate inputs
		if (!amount || !currency || !steamId || !teamId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Verify user is paying for themselves or is an admin
		if (locals.user.steamId !== steamId && !isAdmin(locals.user)) {
			return json({ error: 'Unauthorized: Cannot create payment for another user' }, { status: 403 });
		}

		const config = getPayPalConfig();
		const baseUrl = process.env.PUBLIC_URL || 'http://localhost:5173';

		const result = await createPayPalOrder({
			amount,
			currency,
			steamId,
			teamId,
			returnUrl: `${baseUrl}/checkout/${steamId}`,
			cancelUrl: `${baseUrl}/checkout/${steamId}`
		});

		if (!result.success) {
			// Log error server-side (sanitized - no sensitive data)
			await logError('PayPal create-order failed', {
				steamId,
				teamId,
				amount,
				currency,
				error: result.error || 'Unknown error'
			});

			// Return generic error to client (never expose sensitive details)
			return json({ error: 'Failed to create payment order. Please try again.' }, { status: 500 });
		}

		return json(result.order);
	} catch (err) {
		// Log error server-side (sanitized)
		await logError('PayPal create-order exception', {
			error: err instanceof Error ? err.message : 'Unknown error'
		});

		// Return generic error to client (never expose sensitive details)
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
