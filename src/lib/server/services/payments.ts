/**
 * Payment Service
 *
 * All payment-related business logic and database operations.
 */

import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { getCurrentSignupSeasonIds } from './signupSeasons';
import { FORMAT_1V1 } from '$lib/server/constants/formats';

/**
 * Get user's active team for checkout.
 * When teamId is provided, looks up that specific team.
 * Otherwise finds the first unpaid team in a current signup season.
 */
export async function getUserActiveTeamForCheckout(
  steamId: string,
  teamId?: number,
) {
  const include = {
    team: {
      include: {
        division: true,
        region: true,
        season: true,
      },
    },
  } as const;

  if (teamId) {
    return await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        teamId,
      },
      include,
    });
  }

  const currentSeasonIds = await getCurrentSignupSeasonIds();

  if (currentSeasonIds.length > 0) {
    const currentSeasonTeam = await prisma.playerInTeam.findFirst({
      where: {
        playerSteamId: steamId,
        active: 1,
        paymentStatus: 0,
        team: {
          seasonId: { in: currentSeasonIds },
        },
      },
      include,
    });

    if (currentSeasonTeam) {
      return currentSeasonTeam;
    }
  }

  return await prisma.playerInTeam.findFirst({
    where: {
      playerSteamId: steamId,
      active: 1,
      paymentStatus: 0,
    },
    include,
  });
}

/**
 * Get existing payment for a season
 */
export async function getExistingPayment(steamId: string, seasonId: number) {
  return await prisma.paymentTracker.findUnique({
    where: {
      playerSteamId_seasonId: {
        playerSteamId: steamId,
        seasonId,
      },
    },
  });
}

/**
 * Update player's payment status in team roster
 */
export async function updatePlayerPaymentStatus(
  steamId: string,
  teamId: number,
) {
  return await prisma.playerInTeam.update({
    where: {
      playerSteamId_teamId: {
        playerSteamId: steamId,
        teamId,
      },
    },
    data: { paymentStatus: 1 },
  });
}

/**
 * Get league fees from global settings
 */
export async function getLeagueFees(): Promise<number> {
  const global = await prisma.global.findFirst();
  return global?.leagueFees ?? 0;
}

/**
 * Mark a player as paid manually (for payments made outside PayPal).
 * Records a Payment and PaymentTracker entry for audit consistency,
 * then updates PlayerInTeam and Team payment statuses.
 */
export async function markPlayerAsPaidManually(
  steamId: string,
  teamId: number,
  adminSteamId: string,
): Promise<void> {
  const playerInTeam = await prisma.playerInTeam.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    include: {
      team: {
        include: { division: true },
      },
    },
  });

  if (!playerInTeam) {
    throw error(404, 'Player is not on this team');
  }

  if (playerInTeam.paymentStatus === 1) {
    throw error(400, 'Player is already marked as paid');
  }

  if (!playerInTeam.team.seasonId) {
    throw error(400, 'Team has no associated season');
  }

  const seasonId = playerInTeam.team.seasonId;
  const signupCost = playerInTeam.team.division?.signupCost ?? 0;
  const paymentId = `manual-${Date.now()}-${steamId}`;

  await prisma.$transaction(async (tx) => {
    if (signupCost > 0) {
      await tx.paymentTracker.upsert({
        where: { playerSteamId_seasonId: { playerSteamId: steamId, seasonId } },
        create: { playerSteamId: steamId, seasonId, amount: signupCost },
        update: { amount: { increment: signupCost } },
      });

      await tx.payment.create({
        data: {
          paymentId,
          purchasedFor: steamId,
          purchasedBy: adminSteamId,
          amount: signupCost.toString(),
          currency: 'MANUAL',
          purchaseDate: new Date(),
          description: `Manual payment - Team #${teamId}`,
          teamId,
        },
      });
    }

    await tx.playerInTeam.update({
      where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
      data: { paymentStatus: 1 },
    });

    const paidPlayersCount = await tx.playerInTeam.count({
      where: { teamId, active: 1, paymentStatus: 1 },
    });

    const requiredPaidPlayers = playerInTeam.team.formatId === FORMAT_1V1 ? 1 : 2;

    if (paidPlayersCount >= requiredPaidPlayers) {
      await tx.team.update({
        where: { id: teamId },
        data: { paymentStatus: 1 },
      });
    }
  });
}

/**
 * Check if division requires payment and if user has paid
 * Returns payment information for redirect decision
 *
 * Payment logic (matching old website):
 * - First-time payer: totalCost = signupCost + leagueFees
 * - Has existing payment: totalCost = signupCost only (league fees already paid)
 */
export async function checkPaymentRequired(options: {
  divisionId: number;
  steamId: string;
  seasonId: number | undefined;
}): Promise<{
  required: boolean;
  alreadyPaid: boolean;
  amountPaid: number;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
  isFirstPayment: boolean;
}> {
  const { divisionId, steamId, seasonId } = options;

  const [division, leagueFees] = await Promise.all([
    prisma.division.findUnique({ where: { id: divisionId } }),
    getLeagueFees(),
  ]);

  if (!division) {
    throw error(404, 'Division not found');
  }

  // Free division - no payment required
  if (division.signupCost === 0) {
    return {
      required: false,
      alreadyPaid: true,
      amountPaid: 0,
      signupCost: 0,
      leagueFees: 0,
      totalCost: 0,
      isFirstPayment: false,
    };
  }

  // No season ID - payment required but can't check existing payments
  if (!seasonId) {
    return {
      required: true,
      alreadyPaid: false,
      amountPaid: 0,
      signupCost: division.signupCost,
      leagueFees,
      totalCost: division.signupCost + leagueFees,
      isFirstPayment: true,
    };
  }

  const existingPayment = await getExistingPayment(steamId, seasonId);
  const amountPaid = existingPayment?.amount || 0;
  const isFirstPayment = amountPaid === 0;

  // First-time payers pay signupCost + leagueFees
  // Returning payers only pay remaining signupCost (league fees already paid)
  const totalCost = isFirstPayment
    ? division.signupCost + leagueFees
    : division.signupCost;

  const alreadyPaid = amountPaid >= totalCost;

  return {
    required: true,
    alreadyPaid,
    amountPaid,
    signupCost: division.signupCost,
    leagueFees: isFirstPayment ? leagueFees : 0,
    totalCost,
    isFirstPayment,
  };
}
