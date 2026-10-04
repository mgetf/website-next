/**
 * Admin division placement board.
 * Loads active entries for a season/region/format and applies batch division moves
 * through changeTeamDivision() so payment side-effects stay in one place.
 */

import { prisma } from '$lib/server/db';
import { TeamStatus } from '$prisma/client.js';
import { badRequest, notFound } from '$lib/server/utils/errors';
import { changeTeamDivision, type ChangeTeamDivisionResult } from '$lib/server/services/teams';
import { getSignupSeasonForRegion } from '$lib/server/services/signupSeasons';
import { placementAssignmentError } from '$lib/utils/placement';
import type { PlacementAssignment, PlacementDivision, PlacementEntry } from '$lib/types/placement';

const PLACEMENT_STATUSES: TeamStatus[] = [
  TeamStatus.UNREADY,
  TeamStatus.PENDING,
  TeamStatus.READY,
  TeamStatus.PLACEMENT,
];

export type PlacementBoard = {
  season: { id: number; seasonNum: number };
  format: { id: number; name: string; isIndividual: boolean };
  region: { id: number; name: string; currencySymbol: string };
  divisions: PlacementDivision[];
  entries: PlacementEntry[];
};

export type DivisionPlacementChange = {
  teamId: number;
  teamName: string;
} & ChangeTeamDivisionResult;

export type ApplyDivisionPlacementsResult = {
  moved: number;
  paymentStatusReset: number;
  statusReset: number;
  refundNotices: number;
  changes: DivisionPlacementChange[];
};

export async function getCurrentPlacementSeason(
  regionId: number,
  formatId: number,
): Promise<{ id: number; seasonNum: number } | null> {
  const seasonId = await getSignupSeasonForRegion(regionId, formatId);
  if (seasonId == null) return null;

  return prisma.season.findFirst({
    where: { id: seasonId, regionId, formatId },
    select: { id: true, seasonNum: true },
  });
}

export async function getPlacementBoard(options: {
  seasonId: number;
  regionId: number;
  formatId: number;
}): Promise<PlacementBoard> {
  const { seasonId, regionId, formatId } = options;

  const [season, format, region, divisions] = await Promise.all([
    prisma.season.findFirst({
      where: { id: seasonId, regionId, formatId },
      select: { id: true, seasonNum: true },
    }),
    prisma.format.findUnique({
      where: { id: formatId },
      select: { id: true, name: true, isIndividual: true },
    }),
    prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true, name: true, currencySymbol: true },
    }),
    prisma.division.findMany({
      where: { regionId, formatId, hidden: 0 },
      select: { id: true, name: true, signupCost: true },
      // League catalog is highest skill first (Invite). Placement reads left → right
      // from Newcomer to Invite, so reverse that order.
      orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }],
    }),
  ]);

  if (!season) notFound('Season not found for this region and format');
  if (!format) notFound('Format not found');
  if (!region) notFound('Region not found');

  const divisionIds = divisions.map((division) => division.id);
  const teams =
    divisionIds.length === 0
      ? []
      : await prisma.team.findMany({
          where: {
            seasonId,
            regionId,
            formatId,
            status: { in: PLACEMENT_STATUSES },
            divisionId: { in: divisionIds },
          },
          select: {
            id: true,
            name: true,
            acronym: true,
            avatar: true,
            status: true,
            divisionId: true,
            players: {
              where: { active: 1 },
              orderBy: { permissionLevel: 'desc' },
              select: {
                player: {
                  select: {
                    steamId: true,
                    steamUsername: true,
                    steamAvatar: true,
                  },
                },
              },
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });

  return {
    season,
    format,
    region,
    divisions,
    entries: teams.flatMap((team) => {
      if (team.divisionId == null) return [];
      return [
        {
          id: team.id,
          name: team.name,
          acronym: team.acronym,
          avatar: team.avatar,
          status: team.status,
          divisionId: team.divisionId,
          players: team.players.map((membership) => ({
            steamId: membership.player.steamId,
            steamUsername: membership.player.steamUsername,
            steamAvatar: membership.player.steamAvatar,
          })),
        },
      ];
    }),
  };
}

/**
 * Apply a batch of division moves. Validates the whole list first, then runs
 * each change through changeTeamDivision() so payment and refund rules stay intact.
 */
export async function applyDivisionPlacements(params: {
  seasonId: number;
  regionId: number;
  formatId: number;
  assignments: PlacementAssignment[];
  adminSteamId: string;
}): Promise<ApplyDivisionPlacementsResult> {
  const { seasonId, regionId, formatId, assignments, adminSteamId } = params;

  const currentSeason = await getCurrentPlacementSeason(regionId, formatId);
  if (!currentSeason) badRequest('No current season for this region and format');
  if (currentSeason.id !== seasonId) {
    badRequest('Placement can only change the current season');
  }

  const uniqueTeamIds = [...new Set(assignments.map((assignment) => assignment.teamId))];
  const uniqueDivisionIds = [...new Set(assignments.map((assignment) => assignment.divisionId))];

  const [teams, divisions] = await Promise.all([
    uniqueTeamIds.length === 0
      ? Promise.resolve([])
      : prisma.team.findMany({
          where: { id: { in: uniqueTeamIds } },
          select: {
            id: true,
            name: true,
            seasonId: true,
            regionId: true,
            formatId: true,
            divisionId: true,
            status: true,
          },
        }),
    uniqueDivisionIds.length === 0
      ? Promise.resolve([])
      : prisma.division.findMany({
          where: { id: { in: uniqueDivisionIds } },
          select: { id: true, regionId: true, formatId: true, hidden: true },
        }),
  ]);

  const message = placementAssignmentError({
    assignments,
    teams,
    divisions,
    seasonId,
    regionId,
    formatId,
  });
  if (message) badRequest(message);

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const changes: DivisionPlacementChange[] = [];

  for (const assignment of assignments) {
    const team = teamById.get(assignment.teamId);
    if (!team) continue;
    if (team.divisionId === assignment.divisionId) continue;

    const result = await changeTeamDivision(assignment.teamId, assignment.divisionId, adminSteamId);
    changes.push({
      teamId: team.id,
      teamName: team.name,
      ...result,
    });
  }

  return {
    moved: changes.length,
    paymentStatusReset: changes.filter((change) => change.paymentStatusReset).length,
    statusReset: changes.filter((change) => change.statusReset).length,
    refundNotices: changes.reduce(
      (total, change) => total + change.notifiedPlayerSteamIds.length,
      0,
    ),
    changes,
  };
}
