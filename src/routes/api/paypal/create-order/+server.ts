import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const PAYPAL_API_BASE =
	process.env.PAYPAL_MODE === 'live'
		? 'https://api-m.paypal.com'
		: 'https://api-m.sandbox.paypal.com';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

/**
 * Get PayPal access token
 */
async function getPayPalAccessToken(): Promise<string> {
	const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

	const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});

	const data = await response.json();
	return data.access_token;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { amount, currency, steamId, teamId } = await request.json();

		// Validate inputs
		if (!amount || !currency || !steamId || !teamId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Get PayPal access token
		const accessToken = await getPayPalAccessToken();

		// Create order
		const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({
				intent: 'CAPTURE',
				purchase_units: [
					{
						amount: {
							currency_code: currency,
							value: amount.toFixed(2)
						},
						description: `MGE.tf Team Signup - Team #${teamId}`,
						custom_id: `${steamId}|${teamId}` // We'll parse this on capture
					}
				],
				application_context: {
					brand_name: 'MGE.tf',
					landing_page: 'NO_PREFERENCE',
					user_action: 'PAY_NOW',
					return_url: `${process.env.PUBLIC_URL || 'http://localhost:5173'}/checkout/${steamId}`,
					cancel_url: `${process.env.PUBLIC_URL || 'http://localhost:5173'}/checkout/${steamId}`
				}
			})
		});

		const order = await response.json();

		if (!response.ok) {
			console.error('PayPal create order error:', order);
			return json({ error: 'Failed to create PayPal order' }, { status: 500 });
		}

		return json(order);
	} catch (err) {
		console.error('Error creating PayPal order:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};


