import { isFreeDivision } from '#lib/utils/signupDivision.js';

/** Paid (1) or exempt (2). Unpaid is 0. */
const PAID_OR_EXEMPT = new Set([1, 2]);

export interface MatchSetRules {
  paymentRequired: boolean;
  signupCost: number;
  seasonFormatId: number | null;
}

export interface MatchSetEntrant {
  status: string;
  paymentStatus: number;
  formatId: number;
}

/**
 * Payment blocks a match only when the season requires it and this division charges.
 * A free division never requires payment, even if the season flag is on.
 */
export function matchSetRequiresPayment(paymentRequired: boolean, signupCost: number): boolean {
  return paymentRequired && !isFreeDivision(signupCost);
}

/**
 * Why an active entrant is left out of a match set.
 * Returns null when they should be scheduled (or given the single bye).
 */
export function matchSetOmissionReason(
  entrant: MatchSetEntrant,
  rules: MatchSetRules,
): string | null {
  if (entrant.status === 'DEAD') return null;

  if (rules.seasonFormatId != null && entrant.formatId !== rules.seasonFormatId) {
    return 'Format does not match this season';
  }

  if (entrant.status === 'UNREADY') return 'Not ready';
  if (entrant.status === 'PENDING') return 'Ready-up is still pending';
  if (entrant.status === 'PLACEMENT') return 'Still in placement';
  if (entrant.status !== 'READY') return `Status ${entrant.status} is not ready`;

  if (
    matchSetRequiresPayment(rules.paymentRequired, rules.signupCost) &&
    !PAID_OR_EXEMPT.has(entrant.paymentStatus)
  ) {
    return 'Unpaid in a paid division';
  }

  return null;
}

/**
 * Every eligible entrant ends in a pairing, except one bye when the count is odd.
 * Leftovers the pairing algorithm dropped are paired together instead of becoming extra byes.
 */
export function placeEligibleTeams<T extends { id: number }>(
  teams: T[],
  paired: T[],
): { paired: T[]; bye: T | null } {
  const pairedIds = new Set(paired.map((team) => team.id));
  const leftovers = teams.filter((team) => !pairedIds.has(team.id));
  const next = [...paired];
  const pool = [...leftovers];

  while (pool.length >= 2) {
    const home = pool.shift();
    const away = pool.shift();
    if (home && away) next.push(home, away);
  }

  return { paired: next, bye: pool[0] ?? null };
}
