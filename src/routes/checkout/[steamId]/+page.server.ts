import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import { prisma } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireAuth(locals.user);

	const steamId = params.steamId;

	// Verify user is checking out for themselves
	if (steamId !== locals.user.steamId) {
		throw redirect(303, '/');
	}

	// Get user's current team
	const playerInTeam = await prisma.playerInTeam.findFirst({
		where: {
			playerSteamId: steamId,
			active: 1,
			team: {
				is1v1: 0
			}
		},
		include: {
			team: {
				include: {
					division: true,
					region: true,
					season: true
				}
			}
		}
	});

	if (!playerInTeam || !playerInTeam.team) {
		throw redirect(303, '/');
	}

	const team = playerInTeam.team;
	const division = team.division;

	if (!division) {
		throw redirect(303, `/teams/${team.id}`);
	}

	// Check if payment is even required
	if (division.signupCost === 0) {
		throw redirect(303, `/teams/${team.id}`);
	}

	// Check if already paid
	if (playerInTeam.paymentStatus === 1) {
		throw redirect(303, `/teams/${team.id}`);
	}

	// Check if already paid in payment tracker
	if (team.seasonId) {
		const existingPayment = await prisma.paymentTracker.findUnique({
			where: {
				playerSteamId_seasonId: {
					playerSteamId: steamId,
					seasonId: team.seasonId
				}
			}
		});

		if (existingPayment && existingPayment.amount >= division.signupCost) {
			// Update payment status
			await prisma.playerInTeam.update({
				where: {
					playerSteamId_teamId: {
						playerSteamId: steamId,
						teamId: team.id
					}
				},
				data: { paymentStatus: 1 }
			});

			throw redirect(303, `/teams/${team.id}`);
		}
	}

	// Determine currency based on region
	let currency = 'USD';
	if (team.regionId === 2) {
		// EU
		currency = 'EUR';
	}

	return {
		team,
		division,
		amount: division.signupCost,
		currency,
		steamId,
		paypalClientId: process.env.PAYPAL_CLIENT_ID || ''
	};
};


