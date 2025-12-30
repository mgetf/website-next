import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { capturePayPalOrder, isPayPalTestMode } from '$lib/server/services/paypal';
import { logError } from '$lib/server/utils/logger';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { orderID, steamId, teamId, amount: requestAmount, currency: requestCurrency } = body;

		// Validate required fields
		if (!orderID || !steamId || !teamId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// In test mode, we need additional data to mock the capture
		const testData = isPayPalTestMode() 
			? { steamId, teamId, amount: requestAmount, currency: requestCurrency } 
			: undefined;

		// Capture the order
		const result = await capturePayPalOrder(orderID, testData);

		if (!result.success || !result.captureData) {
			await logError('PayPal capture-order failed', { orderID, steamId, error: result.error || 'Unknown error' });
			return json({ success: false, error: 'Failed to capture payment. Please contact support.' }, { status: 500 });
		}

		const captureData = result.captureData;
		const purchase = captureData.purchase_units?.[0];
		const capture = purchase?.payments?.captures?.[0];
		
		if (!purchase || !capture) {
			await logError('PayPal capture-order invalid response', { orderID, steamId });
			return json({ success: false, error: 'Invalid payment response. Please contact support.' }, { status: 500 });
		}

		const amount = parseFloat(capture.amount.value);
		const currency = capture.amount.currency_code;

		// Get player's team membership to find season
		const playerInTeam = await prisma.playerInTeam.findUnique({
			where: {
				playerSteamId_teamId: { playerSteamId: steamId, teamId }
			},
			include: { team: true }
		});

		if (!playerInTeam?.team.seasonId) {
			return json({ success: false, error: 'Team or season not found' }, { status: 404 });
		}

		const seasonId = playerInTeam.team.seasonId;

		// Record payment: update tracker, create payment record, update player status
		await prisma.$transaction([
			prisma.paymentTracker.upsert({
				where: { playerSteamId_seasonId: { playerSteamId: steamId, seasonId } },
				create: { playerSteamId: steamId, seasonId, amount },
				update: { amount }
			}),
			prisma.payment.create({
				data: {
					paymentId: capture.id,
					purchasedFor: steamId,
					purchasedBy: steamId,
					amount: amount.toString(),
					currency,
					purchaseDate: new Date().toISOString(),
					description: `Team signup payment - Team #${teamId}`,
					teamId
				}
			}),
			prisma.playerInTeam.update({
				where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
				data: { paymentStatus: 1 }
			})
		]);

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

		return json({ success: true, teamId });
	} catch (err) {
		// Log error server-side (sanitized)
		await logError('PayPal capture-order exception', {
			error: err instanceof Error ? err.message : 'Unknown error'
		});

		// Return generic error to client (never expose sensitive details)
		return json({ success: false, error: 'Internal server error' }, { status: 500 });
	}
};
