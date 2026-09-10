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
