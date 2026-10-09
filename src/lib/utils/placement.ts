import { isFreeDivision } from '#lib/utils/signupDivision.js';
import type {
  PlacementAssignment,
  PlacementColumn,
  PlacementDivisionContext,
  PlacementMove,
  PlacementPaymentEffect,
  PlacementTeamContext,
} from '#lib/types/placement.js';

export function placementPaymentEffect(
  fromSignupCost: number,
  toSignupCost: number,
): PlacementPaymentEffect {
  const fromFree = isFreeDivision(fromSignupCost);
  const toFree = isFreeDivision(toSignupCost);
  if (fromFree && !toFree) return 'reset-unpaid';
  if (!fromFree && toFree) return 'mark-exempt';
  return 'none';
}

export function isPlacementDragItem(item: { id: number | string }): item is { id: number } {
  return typeof item.id === 'number';
}

export function divisionByTeamId(columns: PlacementColumn[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const column of columns) {
    for (const item of column.items) {
      if (!isPlacementDragItem(item)) continue;
      map[item.id] = column.id;
    }
  }
  return map;
}

export function diffPlacementMoves(
  original: Record<number, number>,
  current: Record<number, number>,
): PlacementAssignment[] {
  const assignments: PlacementAssignment[] = [];
  for (const [teamIdRaw, divisionId] of Object.entries(current)) {
    const teamId = Number(teamIdRaw);
    if (!Number.isInteger(teamId) || original[teamId] === divisionId) continue;
    if (original[teamId] == null) continue;
    assignments.push({ teamId, divisionId });
  }
  return assignments;
}

export function describePlacementMoves(
  columns: PlacementColumn[],
  original: Record<number, number>,
): PlacementMove[] {
  const current = divisionByTeamId(columns);
  const divisionById = new Map(columns.map((column) => [column.id, column]));
  const entryById = new Map(
    columns.flatMap((column) =>
      column.items.filter(isPlacementDragItem).map((item) => [item.id, item]),
    ),
  );

  return diffPlacementMoves(original, current).flatMap((assignment) => {
    const entry = entryById.get(assignment.teamId);
    const fromDivision = divisionById.get(original[assignment.teamId]);
    const toDivision = divisionById.get(assignment.divisionId);
    if (!entry || !fromDivision || !toDivision) return [];
    return [
      {
        teamId: assignment.teamId,
        teamName: entry.name,
        fromDivisionId: fromDivision.id,
        fromDivisionName: fromDivision.name,
        toDivisionId: toDivision.id,
        toDivisionName: toDivision.name,
        effect: placementPaymentEffect(fromDivision.signupCost, toDivision.signupCost),
        status: entry.status,
      },
    ];
  });
}

export function placementAssignmentError(params: {
  assignments: PlacementAssignment[];
  teams: PlacementTeamContext[];
  divisions: PlacementDivisionContext[];
  seasonId: number;
  regionId: number;
  formatId: number;
}): string | null {
  if (params.assignments.length === 0) return 'No placement changes to save';

  const seenTeamIds = new Set<number>();
  for (const assignment of params.assignments) {
    if (seenTeamIds.has(assignment.teamId)) return 'Duplicate team in placement list';
    seenTeamIds.add(assignment.teamId);
  }

  const teamById = new Map(params.teams.map((team) => [team.id, team]));
  const divisionById = new Map(params.divisions.map((division) => [division.id, division]));

  if (teamById.size !== params.assignments.length) {
    return 'One or more teams were not found';
  }

  for (const assignment of params.assignments) {
    const team = teamById.get(assignment.teamId);
    if (!team) return 'One or more teams were not found';
    if (
      team.seasonId !== params.seasonId ||
      team.regionId !== params.regionId ||
      team.formatId !== params.formatId
    ) {
      return 'One or more teams do not belong to this season, region, and format';
    }
    if (team.status === 'DEAD') return 'Withdrawn entries cannot be placed';

    const division = divisionById.get(assignment.divisionId);
    if (!division) return 'One or more divisions were not found';
    if (division.regionId !== params.regionId || division.formatId !== params.formatId) {
      return 'Division must be in the same region and format';
    }
    if (division.hidden !== 0) return 'Cannot place teams into a hidden division';
  }

  return null;
}

/**
 * Keep teams hidden by the roster filter in the column while the drag list
 * only contains the teams currently shown.
 */
export function mergePlacementColumnItems<T extends { id: number }>(
  current: T[],
  visibleNext: T[],
  keepHidden: (item: T) => boolean,
): T[] {
  const visibleIds = new Set(visibleNext.map((item) => item.id));
  const hidden = current.filter((item) => keepHidden(item) && !visibleIds.has(item.id));
  return [...visibleNext, ...hidden];
}

export function matchesPlacementSearch(
  entry: { name: string; acronym: string | null; players: { steamUsername: string }[] },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (entry.name.toLowerCase().includes(needle)) return true;
  if (entry.acronym?.toLowerCase().includes(needle)) return true;
  return entry.players.some((player) => player.steamUsername.toLowerCase().includes(needle));
}
