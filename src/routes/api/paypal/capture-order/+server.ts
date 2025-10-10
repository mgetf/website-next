import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

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
		const { orderID, steamId } = await request.json();

		if (!orderID || !steamId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// Get PayPal access token
		const accessToken = await getPayPalAccessToken();

		// Capture order
		const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderID}/capture`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`
			}
		});

		const captureData = await response.json();

		if (!response.ok) {
			console.error('PayPal capture order error:', captureData);
			return json({ success: false, error: 'Failed to capture payment' }, { status: 500 });
		}

		// Extract payment details
		const purchase = captureData.purchase_units[0];
		const capture = purchase.payments.captures[0];
		const amount = parseFloat(capture.amount.value);
		const currency = capture.amount.currency_code;
		const customId = purchase.custom_id;

		// Parse custom_id to get steamId and teamId
		const [payerSteamId, teamIdStr] = customId.split('|');
		const teamId = parseInt(teamIdStr);

		// Get player's current team to find season
		const playerInTeam = await prisma.playerInTeam.findUnique({
			where: {
				playerSteamId_teamId: {
					playerSteamId: steamId,
					teamId
				}
			},
			include: {
				team: true
			}
		});

		if (!playerInTeam || !playerInTeam.team.seasonId) {
			return json({ success: false, error: 'Team or season not found' }, { status: 404 });
		}

		const seasonId = playerInTeam.team.seasonId;

		// Create or update payment tracker
		await prisma.paymentTracker.upsert({
			where: {
				playerSteamId_seasonId: {
					playerSteamId: steamId,
					seasonId
				}
			},
			create: {
				playerSteamId: steamId,
				seasonId,
				amount
			},
			update: {
				amount
			}
		});

		// Create payment record
		await prisma.payment.create({
			data: {
				playerSteamId: steamId,
				amount,
				currency,
				transactionId: capture.id,
				status: 'COMPLETED'
			}
		});

		// Update player payment status
		await prisma.playerInTeam.update({
			where: {
				playerSteamId_teamId: {
					playerSteamId: steamId,
					teamId
				}
			},
			data: {
				paymentStatus: 1
			}
		});

		// Check if 2+ players have paid, update team payment status
		const paidPlayersCount = await prisma.playerInTeam.count({
			where: {
				teamId,
				active: 1,
				paymentStatus: 1
			}
		});

		if (paidPlayersCount >= 2) {
			await prisma.team.update({
				where: { id: teamId },
				data: { paymentStatus: 1 }
			});
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error capturing PayPal order:', err);
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};


