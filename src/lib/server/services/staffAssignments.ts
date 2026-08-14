/**
 * Staff assignment service.
 * Display-only scope of staff to a format + division (region is implied by the division).
 */

import { prisma } from '$lib/server/db';
import { badRequest } from '$lib/server/utils/errors';
import type { StaffAssignmentDisplay } from '$lib/types/staff';

export type StaffAssignmentPair = {
  formatId: number;
  divisionId: number;
};

export type LeagueStaffMember = {
  steamId: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type LeagueStaffByDivision = {
  division: { id: number; name: string };
  staff: LeagueStaffMember[];
};

export type LeagueStaffAssignment = {
  formatId: number;
  regionId: number;
  divisionId: number;
  user: {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
    permissionLevel: string;
  };
  division: { id: number; name: string };
};

const STAFF_ASSIGNMENT_TOKEN = /^(\d+):(\d+)$/;

export const staffAssignmentInclude = {
  format: { select: { id: true, name: true } },
  division: {
    select: {
      id: true,
      name: true,
      regionId: true,
      region: { select: { id: true, name: true } },
    },
  },
} as const;

type StaffAssignmentWithRelations = {
  formatId: number;
  divisionId: number;
  format: { id: number; name: string };
  division: {
    id: number;
    name: string;
    regionId: number;
    region: { id: number; name: string };
  };
};

function parseStaffAssignmentToken(token: string): StaffAssignmentPair | null {
  const match = STAFF_ASSIGNMENT_TOKEN.exec(token);
  if (!match) return null;
  const formatId = Number(match[1]);
  const divisionId = Number(match[2]);
  if (
    !Number.isInteger(formatId) ||
    !Number.isInteger(divisionId) ||
    formatId < 1 ||
    divisionId < 1
  ) {
    return null;
  }
  return { formatId, divisionId };
}

export function parseStaffAssignmentTokens(tokens: string[]): StaffAssignmentPair[] {
  const seen = new Set<string>();
  const pairs: StaffAssignmentPair[] = [];
  for (const token of tokens) {
    if (token === '') continue;
    const parsed = parseStaffAssignmentToken(token);
    if (!parsed) badRequest('Invalid staff assignment');
    const key = `${parsed.formatId}:${parsed.divisionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(parsed);
  }
  return pairs;
}

function filterAssignmentsForLeague<T extends { formatId: number; regionId: number }>(
  assignments: T[],
  formatId: number,
  regionId: number,
): T[] {
  return assignments.filter(
    (assignment) => assignment.formatId === formatId && assignment.regionId === regionId,
  );
}

function groupStaffByDivision(assignments: LeagueStaffAssignment[]): LeagueStaffByDivision[] {
  const map = new Map<number, LeagueStaffByDivision>();

  for (const assignment of assignments) {
    if (!map.has(assignment.divisionId)) {
      map.set(assignment.divisionId, {
        division: {
          id: assignment.division.id,
          name: assignment.division.name,
        },
        staff: [],
      });
    }

    map.get(assignment.divisionId)!.staff.push({
      steamId: assignment.user.steamId,
      name: assignment.user.steamUsername,
      avatar: assignment.user.steamAvatar,
      role: assignment.user.permissionLevel === 'ADMIN' ? 'Head Admin' : 'Moderator',
    });
  }

  for (const group of map.values()) {
    group.staff.sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === 'Head Admin' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  return Array.from(map.values()).sort((a, b) => b.division.id - a.division.id);
}

export function staffForLeagueFromAssignments(
  assignments: LeagueStaffAssignment[],
  formatId: number,
  regionId: number,
): LeagueStaffByDivision[] {
  return groupStaffByDivision(filterAssignmentsForLeague(assignments, formatId, regionId));
}

export function mapStaffAssignmentForDisplay(
  assignment: StaffAssignmentWithRelations,
): StaffAssignmentDisplay {
  return {
    formatId: assignment.formatId,
    formatName: assignment.format.name,
    divisionId: assignment.divisionId,
    divisionName: assignment.division.name,
    regionId: assignment.division.regionId,
    regionName: assignment.division.region.name,
  };
}

export async function getRegionIdsByFormat(): Promise<Record<number, number[]>> {
  const rows = await prisma.season.findMany({
    select: { formatId: true, regionId: true },
    distinct: ['formatId', 'regionId'],
  });

  const map: Record<number, number[]> = {};
  for (const row of rows) {
    const list = map[row.formatId] ?? [];
    list.push(row.regionId);
    map[row.formatId] = list;
  }
  return map;
}

export async function replaceStaffAssignments(userId: string, assignments: StaffAssignmentPair[]) {
  if (assignments.length > 0) {
    const formatIds = [...new Set(assignments.map((assignment) => assignment.formatId))];
    const divisionIds = [...new Set(assignments.map((assignment) => assignment.divisionId))];

    const [formats, divisions, seasonPairs] = await Promise.all([
      prisma.format.findMany({ where: { id: { in: formatIds } }, select: { id: true } }),
      prisma.division.findMany({
        where: { id: { in: divisionIds } },
        select: { id: true, regionId: true },
      }),
      prisma.season.findMany({
        where: { formatId: { in: formatIds } },
        select: { formatId: true, regionId: true },
        distinct: ['formatId', 'regionId'],
      }),
    ]);

    const formatSet = new Set(formats.map((format) => format.id));
    const divisionById = new Map(divisions.map((division) => [division.id, division]));
    const seasonSet = new Set(seasonPairs.map((season) => `${season.formatId}:${season.regionId}`));

    for (const assignment of assignments) {
      if (!formatSet.has(assignment.formatId)) badRequest('Format not found');
      const division = divisionById.get(assignment.divisionId);
      if (!division) badRequest('Division not found');
      if (!seasonSet.has(`${assignment.formatId}:${division.regionId}`)) {
        badRequest('That format is not available in the selected region');
      }
    }
  }

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({ where: { userId } }),
    ...(assignments.length > 0
      ? [
          prisma.staffAssignment.createMany({
            data: assignments.map((assignment) => ({
              userId,
              formatId: assignment.formatId,
              divisionId: assignment.divisionId,
            })),
          }),
        ]
      : []),
  ]);
}

export async function getStaffForLeague(
  formatId: number,
  regionId: number,
): Promise<LeagueStaffByDivision[]> {
  const rows = await prisma.staffAssignment.findMany({
    where: {
      formatId,
      division: { regionId },
      user: { permissionLevel: { in: ['MODERATOR', 'ADMIN'] } },
    },
    include: {
      user: {
        select: {
          steamId: true,
          steamUsername: true,
          steamAvatar: true,
          permissionLevel: true,
        },
      },
      division: { select: { id: true, name: true } },
    },
  });

  return staffForLeagueFromAssignments(
    rows.map((row) => ({
      formatId: row.formatId,
      regionId,
      divisionId: row.divisionId,
      user: row.user,
      division: row.division,
    })),
    formatId,
    regionId,
  );
}
