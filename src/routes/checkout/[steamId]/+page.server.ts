import type { PageServerLoad } from './$types';
import { requireAuth } from '$lib/server/auth/permissions';
import {
  getUserActiveTeamForCheckout,
  getExistingPayment,
  updatePlayerPaymentStatus,
  getLeagueFees,
} from '$lib/server/services/payments';
import { isPayPalTestMode } from '$lib/server/services/paypal';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const steamId = params.steamId;

  // Verify user is checking out for themselves
  if (steamId !== locals.user.steamId) {
    throw redirect(303, '/');
  }

  // Get user's current team
  const playerInTeam = await getUserActiveTeamForCheckout(steamId);

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

  // Get existing payment and league fees
  const [existingPayment, leagueFees] = await Promise.all([
    team.seasonId ? getExistingPayment(steamId, team.seasonId) : null,
    getLeagueFees(),
  ]);

  const amountPaid = existingPayment?.amount || 0;
  const isFirstPayment = amountPaid === 0;

  // First-time payers pay signupCost + leagueFees
  // Returning payers only pay remaining signupCost
  const effectiveLeagueFees = isFirstPayment ? leagueFees : 0;
  const totalAmount = division.signupCost + effectiveLeagueFees;

  // Check if already paid enough
  if (amountPaid >= totalAmount) {
    await updatePlayerPaymentStatus(steamId, team.id);
    throw redirect(303, `/teams/${team.id}`);
  }

  // Determine currency based on region
  let currency = 'USD';
  if (team.regionId === 2) {
    // EU
    currency = 'EUR';
  }

  const paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
  const isTestMode = isPayPalTestMode();

  return {
    team,
    division,
    signupCost: division.signupCost,
    leagueFees: effectiveLeagueFees,
    totalAmount,
    amountPaid,
    isFirstPayment,
    currency,
    steamId,
    paypalClientId,
    isTestMode,
  };
};
