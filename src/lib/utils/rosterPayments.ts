/**
 * How many active roster members must be paid for a team to meet its
 * format's payment requirement.
 *
 * `requiredPaidPlayers` is a cap (e.g. 3 for 2v2 so a sub cannot ride free).
 * A smaller current roster only needs that many paid (a 2-player 2v2 team
 * is not blocked waiting for a third player).
 */
export function paidPlayersNeeded(requiredPaidPlayers: number, activePlayerCount: number): number {
  if (requiredPaidPlayers < 1 || activePlayerCount < 1) return 0;
  return Math.min(requiredPaidPlayers, activePlayerCount);
}

export function hasMetPaidPlayerRequirement(
  paidCount: number,
  requiredPaidPlayers: number,
  activePlayerCount: number,
): boolean {
  const needed = paidPlayersNeeded(requiredPaidPlayers, activePlayerCount);
  return needed > 0 && paidCount >= needed;
}
