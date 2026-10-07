export type StandingsTeamIdentity = {
  playerId?: string;
  players?: Array<{ steamId: string }>;
};

export type StandingsRecord = {
  status: string;
  wins: number;
  losses: number;
  points: number;
};

/** Compact standings tables show this many rows before the body scrolls. */
export const STANDINGS_MAX_VISIBLE_ROWS = 15;

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

/** All division blocks start expanded; the page still allows collapsing. */
export function defaultExpandedDivisionIds(divisions: Array<{ id: number }>): number[] {
  return divisions.map((division) => division.id);
}

/** Living entries listed on a league page while that season is still taking signups. */
export const SIGNUP_LIST_STATUSES = ['UNREADY', 'PENDING', 'READY', 'PLACEMENT'] as const;

/** Green / READY rows are the only ones that receive a standings rank. */
export function isRankedStandingsTeam(team: Pick<StandingsRecord, 'status'>): boolean {
  return team.status === 'READY';
}

/**
 * Assigned-division standings: always keep READY (even 0-0, season may not have
 * started). Everyone else only stays if they already played — historical dropouts,
 * not throwaway signups that never entered.
 */
export function shouldShowInDivisionStandings(
  team: Pick<StandingsRecord, 'status' | 'wins' | 'losses'>,
): boolean {
  if (isRankedStandingsTeam(team)) return true;
  return team.wins + team.losses > 0;
}

/**
 * Keep the public division list as a signup roster while signups are open, and
 * after they close until the season has a recorded match. Once a result exists,
 * a closed season uses the standings rule.
 */
export function listsLivingSignups(signupsOpen: boolean, matchesStarted: boolean): boolean {
  return signupsOpen || !matchesStarted;
}

/**
 * Open signups (and a closed season that has not played yet) list every entry
 * that has not withdrawn, including 0-0 UNREADY and PENDING rows. After the
 * first result, a closed season uses the standings rule.
 */
export function shouldShowOnLeagueDivision(
  team: Pick<StandingsRecord, 'status' | 'wins' | 'losses'>,
  signupsOpen: boolean,
): boolean {
  if (signupsOpen) return team.status !== 'DEAD';
  return shouldShowInDivisionStandings(team);
}

/** READY first, then W-L-points. A 0-5 READY team outranks a 0-0 UNREADY/DEAD row. */
export function compareStandingsTeams(a: StandingsRecord, b: StandingsRecord): number {
  const aRanked = isRankedStandingsTeam(a) ? 0 : 1;
  const bRanked = isRankedStandingsTeam(b) ? 0 : 1;
  if (aRanked !== bRanked) return aRanked - bRanked;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  if (b.points !== a.points) return b.points - a.points;
  return 0;
}

export function withStandingsRanks<T extends Pick<StandingsRecord, 'status'>>(
  teams: T[],
  assignRanks = true,
): Array<T & { rank: number | null }> {
  let nextRank = 0;
  return teams.map((team) => {
    if (assignRanks && isRankedStandingsTeam(team)) {
      nextRank += 1;
      return { ...team, rank: nextRank };
    }
    return { ...team, rank: null };
  });
}
