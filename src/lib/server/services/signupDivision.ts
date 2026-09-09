/**
 * Shared signup-division validation and initial payment status.
 * Free vs paid is determined only by signupCost, never by division name.
 */

import { prisma } from '$lib/server/db';
import { badRequest } from '$lib/server/utils/errors';
import { FREE_DIVISION_ACK_FIELD, isFreeDivision } from '$lib/utils/signupDivision';

export type SignupDivision = {
  id: number;
  name: string;
  signupCost: number;
  regionId: number;
  formatId: number;
};

export function signupDivisionSelectionError(params: {
  division: SignupDivision | null;
  regionId: number;
  formatId: number;
  freeDivisionAcknowledged: boolean;
}): string | null {
  if (!params.division) return 'Invalid division selected';
  if (params.division.regionId !== params.regionId) {
    return 'Division does not match the selected region';
  }
  if (params.division.formatId !== params.formatId) {
    return 'Division does not match this format';
  }
  if (isFreeDivision(params.division.signupCost) && !params.freeDivisionAcknowledged) {
    return 'You must acknowledge that if administrators later place you in a paid division, you will have to pay to participate';
  }
  return null;
}

export async function requireSignupDivision(params: {
  divisionId: number;
  regionId: number;
  formatId: number;
  freeDivisionAcknowledged: boolean;
}): Promise<SignupDivision> {
  const division = await prisma.division.findFirst({
    where: { id: params.divisionId, hidden: 0 },
    select: { id: true, name: true, signupCost: true, regionId: true, formatId: true },
  });
  if (!division) badRequest('Invalid division selected');

  const message = signupDivisionSelectionError({
    division,
    regionId: params.regionId,
    formatId: params.formatId,
    freeDivisionAcknowledged: params.freeDivisionAcknowledged,
  });
  if (message) badRequest(message);

  return division;
}

export function initialTeamPaymentStatus(signupCost: number): number {
  return isFreeDivision(signupCost) ? 2 : 0;
}

export async function initialPlayerPaymentStatus(params: {
  signupCost: number;
  steamId: string;
  seasonId: number;
}): Promise<number> {
  if (isFreeDivision(params.signupCost)) return 2;

  const existingPayment = await prisma.paymentTracker.findUnique({
    where: {
      playerSteamId_seasonId: {
        playerSteamId: params.steamId,
        seasonId: params.seasonId,
      },
    },
  });
  const amountPaid = existingPayment?.amount || 0;
  return amountPaid >= params.signupCost ? 1 : 0;
}

export function formAcknowledgedFreeDivision(formData: FormData): boolean {
  const value = formData.get(FREE_DIVISION_ACK_FIELD);
  return value === 'on' || value === 'true' || value === '1';
}
