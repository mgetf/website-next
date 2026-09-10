/** A division is free when its signup cost is zero — never infer this from the name. */
export function isFreeDivision(signupCost: number): boolean {
  return signupCost <= 0;
}

export const FREE_DIVISION_ACK_FIELD = 'freeDivisionAck';

/**
 * Warn only when the player picked a free division and another visible option in
 * the same region/format is paid. If every choice is free, there is nothing to acknowledge.
 */
export function needsFreeDivisionAcknowledgment(
  selectedSignupCost: number | null | undefined,
  siblingSignupCosts: number[],
): boolean {
  if (selectedSignupCost == null || !isFreeDivision(selectedSignupCost)) return false;
  return siblingSignupCosts.some((cost) => !isFreeDivision(cost));
}
