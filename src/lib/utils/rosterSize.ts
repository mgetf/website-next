/**
 * Whether the active roster is large enough for the team to ready up.
 * Payment status does not affect this check.
 */
export function hasMetMinRosterSize(activePlayerCount: number, minRosterSize: number): boolean {
  return minRosterSize >= 1 && activePlayerCount >= minRosterSize;
}
