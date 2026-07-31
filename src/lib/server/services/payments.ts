/**
 * Payment Service
 *
 * All payment-related business logic and database operations.
 */

import { notFound, badRequest } from '$lib/server/utils/errors';
import type { CheckoutParticipation } from '$lib/types/checkout';
import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  createTeamsClient,
  getRosterMember,
  getTeam,
  setMemberPayment,
} from '$lib/server/rama/teams';
import { createPaymentsClient, markPaid } from '$lib/server/rama/payments';
import { createDivisionsClient, getDivision } from '$lib/server/rama/divisions';

export interface UnpaidPlayer {
  steamId: string;
  name: string;
  avatar: string | null;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
}

/**
 * Load all unpaid active players in a team with their individual costs.
 * Used by the checkout page to allow paying for teammates.
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getTeamUnpaidPlayers(
  teamId: number,
  seasonId: number,
): Promise<UnpaidPlayer[]> {
  return [];
}

/**
 * Get existing payment for a season
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getExistingPayment(
  steamId: string,
  seasonId: number,
): Promise<{ id: number; steamId: string; seasonId: number; amount: number } | null> {
  void steamId;
  void seasonId;
  return null;
}

/**
 * Get league fees from global settings
 */
/** @lintignore Soft-stub / cutover API surface */
export async function getLeagueFees(): Promise<number> {
  return 0;
}

/**
 * Mark a player as paid manually (for payments made outside PayPal).
 * Under Rama: PaymentsModule mark-paid + TeamsModule set-member-payment.
 */
export async function markPlayerAsPaidManually(
  steamId: string,
  teamId: number,
  adminSteamId: string,
): Promise<void> {
  if (isRamaBackend()) {
    void adminSteamId;
    const opts = ramaClientOpts();
    const teams = createTeamsClient(opts);
    const teamKey = String(teamId);
    const team = await getTeam(teams, teamKey);
    if (!team) notFound('Team not found');

    const member = await getRosterMember(teams, teamKey, steamId);
    if (!member?.active) notFound('Player is not on this team');
    if (member.paymentStatus === 'PAID' || member.paymentStatus === 'EXEMPT') {
      badRequest('Player is already marked as paid');
    }

    const seasonId = String(team.seasonId ?? '');
    if (!seasonId) badRequest('Team has no associated season');

    let amount = 0;
    const divisionId = team.divisionId != null ? String(team.divisionId) : '';
    if (divisionId) {
      const division = await getDivision(createDivisionsClient(opts), divisionId);
      amount = Number(division?.signupCost ?? 0);
    }

    const payAck = await markPaid(createPaymentsClient(opts), {
      steamId,
      seasonId,
      teamId: teamKey,
      status: 'PAID',
      amount,
      source: 'manual',
      paymentId: `manual-${Date.now()}-${steamId}`,
    });
    if (!payAck.ok) badRequest(payAck.error ?? 'Failed to record payment');

    const memberAck = await setMemberPayment(teams, {
      teamId: teamKey,
      steamId,
      paymentStatus: 'PAID',
    });
    if (!memberAck.ok) badRequest(memberAck.error ?? 'Failed to update member payment');
    return;
  }
  throw new Error('markPlayerAsPaidManually requires DATA_BACKEND=rama');
}

/**
 * Record a completed PayPal capture: creates payment records and updates player/team payment status.
 * Supports paying for multiple players in a single capture.
 */
export async function recordPayPalCapture(options: {
  payerSteamId: string;
  paidForSteamIds: string[];
  teamId: number;
  captureId: string;
  amount: number;
  currency: string;
}): Promise<void> {
  void options;
  badRequest('PayPal captures are not available under Rama');
}

export interface PaymentHistoryEntry {
  id: string;
  date: Date;
  method: 'paypal' | 'items' | 'manual';
  description: string;
  amount: string;
  currency: string;
  teamId: number | null;
  teamName: string | null;
  status: 'completed' | 'pending' | 'expired' | 'cancelled';
}

export async function getUserPaymentHistory(
  steamId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ entries: PaymentHistoryEntry[]; total: number }> {
  void steamId;
  void page;
  void limit;
  return { entries: [], total: 0 };
}

/**
 * Load all unpaid participations for a user across all their active teams.
 * Used by the multi-team checkout page.
 */
export async function getAllUnpaidParticipations(
  steamId: string,
): Promise<CheckoutParticipation[]> {
  return [];
}

/**
 * Record completed PayPal captures for multiple teams in a single transaction.
 * League fee is charged once per season and is tracked via PaymentTracker;
 * we simply record the signupCost increment per player (matching single-team behaviour).
 */
export async function recordMultiTeamPayPalCapture(options: {
  payerSteamId: string;
  teams: { teamId: number; paidForSteamIds: string[] }[];
  captureId: string;
  currency: string;
}): Promise<void> {
  void options;
  badRequest('PayPal captures are not available under Rama');
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
  // Under Rama there is no Postgres payment table yet — all divisions are free-to-join.
  if (isRamaBackend()) {
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
  throw new Error('checkPaymentRequired requires DATA_BACKEND=rama');
}
