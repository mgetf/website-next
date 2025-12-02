import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';
import { capturePayPalOrder, isPayPalTestMode } from '$lib/server/services/paypal';
import { logError } from '$lib/server/utils/logger';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { orderID, steamId } = body;
		// These are only used for test mode
		const testAmount = body.amount;
		const testCurrency = body.currency;
		const testTeamId = body.teamId;

		if (!orderID || !steamId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// In test mode, we need additional data to mock the capture
		const testData = isPayPalTestMode() ? { steamId, teamId: testTeamId, amount: testAmount, currency: testCurrency } : undefined;

		// Capture the order
		const result = await capturePayPalOrder(orderID, testData);

		if (!result.success || !result.captureData) {
			// Log error server-side (sanitized - no sensitive data)
			await logError('PayPal capture-order failed', {
				orderID,
				steamId,
				error: result.error || 'Unknown error'
			});

			// Return generic error to client (never expose sensitive details)
			return json({ success: false, error: 'Failed to capture payment. Please contact support.' }, { status: 500 });
		}

		const captureData = result.captureData;

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
					playerSteamId: payerSteamId,
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
					playerSteamId: payerSteamId,
					seasonId
				}
			},
			create: {
				playerSteamId: payerSteamId,
				seasonId,
				amount
			},
			update: {
				amount
			}
		});

		// Create payment record (matches Payment model schema)
		await prisma.payment.create({
			data: {
				paymentId: capture.id, // PayPal transaction ID as payment ID
				purchasedFor: payerSteamId,
				purchasedBy: payerSteamId,
				amount: amount.toString(), // Schema expects String
				currency,
				purchaseDate: new Date().toISOString(),
				description: `Team signup payment - Team #${teamId}`,
				teamId
			}
		});

		// Update player payment status
		await prisma.playerInTeam.update({
			where: {
				playerSteamId_teamId: {
					playerSteamId: payerSteamId,
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
