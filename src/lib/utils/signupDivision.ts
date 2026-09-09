/** A division is free when its signup cost is zero — never infer this from the name. */
export function isFreeDivision(signupCost: number): boolean {
  return signupCost <= 0;
}

export const FREE_DIVISION_ACK_FIELD = 'freeDivisionAck';
