export type StandingsTeamIdentity = {
  playerId?: string;
  players?: Array<{ steamId: string }>;
};

/** True when this standings row is the logged-in viewer's 1v1 entry or 2v2 roster. */
export function isViewerStandingsTeam(
  team: StandingsTeamIdentity,
  viewerSteamId: string | null | undefined,
  isIndividual: boolean,
): boolean {
  if (!viewerSteamId) return false;
  if (isIndividual) return team.playerId === viewerSteamId;
  return team.players?.some((player) => player.steamId === viewerSteamId) ?? false;
}

/**
 * Open the viewer's division(s). Logged out / not on a roster: first assigned
 * division, or Unplaced if that's the only block.
 */
export function defaultExpandedDivisionIds(
  divisions: Array<{ id: number; hasViewer: boolean }>,
): number[] {
  const viewerIds = divisions
    .filter((division) => division.hasViewer)
    .map((division) => division.id);
  if (viewerIds.length > 0) return viewerIds;

  const assigned = divisions.find((division) => division.id !== 0);
  if (assigned) return [assigned.id];
  return divisions[0] ? [divisions[0].id] : [];
}
