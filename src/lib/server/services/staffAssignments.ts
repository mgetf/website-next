/**
 * Staff assignment service.
 * Scope of staff to a region, with optional format and division.
 * Null format = every format in that region. Null division = every division of the chosen format.
 */

import { prisma } from '#lib/server/db.js';
import { badRequest } from '#lib/server/utils/errors.js';
import type { StaffAssignmentDisplay, StaffAssignmentScope } from '#lib/types/staff.js';
import { collapseStaffAssignments } from '#lib/utils/staffScope.js';

export type StaffAssignmentPair = StaffAssignmentScope;

export { collapseStaffAssignments, serializeStaffAssignmentToken } from '#lib/utils/staffScope.js';

export type LeagueStaffMember = {
  steamId: string;
  name: string;
  avatar: string | null;
  role: string;
};

export type LeagueStaffByDivision = {
  division: { id: number | null; name: string };
  staff: LeagueStaffMember[];
};

export type LeagueStaffAssignment = {
  formatId: number | null;
  regionId: number;
  divisionId: number | null;
  user: {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
    permissionLevel: string;
  };
  division: { id: number; name: string; sortOrder: number } | null;
};

const STAFF_ASSIGNMENT_TOKEN = /^(\d+)(?::(\d+))?(?::(\d+))?$/;
const REGION_WIDE_SORT = -1;

export const staffAssignmentInclude = {
  region: { select: { id: true, name: true } },
  format: { select: { id: true, name: true } },
  division: { select: { id: true, name: true } },
} as const;

type StaffAssignmentWithRelations = {
  regionId: number;
  formatId: number | null;
  divisionId: number | null;
  region: { id: number; name: string };
  format: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
};

function parsePositiveInt(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function parseStaffAssignmentToken(token: string): StaffAssignmentPair | null {
  const match = STAFF_ASSIGNMENT_TOKEN.exec(token);
  if (!match) return null;
  const regionId = parsePositiveInt(match[1]);
  const formatId = parsePositiveInt(match[2]);
  const divisionId = parsePositiveInt(match[3]);
  if (regionId == null) return null;
  if (match[3] != null && formatId == null) return null;
  if (divisionId != null && formatId == null) return null;
  return { regionId, formatId, divisionId };
}

export function parseStaffAssignmentTokens(tokens: string[]): StaffAssignmentPair[] {
  const pairs: StaffAssignmentPair[] = [];
  for (const token of tokens) {
    if (token === '') continue;
    const parsed = parseStaffAssignmentToken(token);
    if (!parsed) badRequest('Invalid staff assignment');
    pairs.push(parsed);
  }
  return collapseStaffAssignments(pairs);
}

function filterAssignmentsForLeague<T extends { formatId: number | null; regionId: number }>(
  assignments: T[],
  formatId: number,
  regionId: number,
): T[] {
  return assignments.filter(
    (assignment) =>
      assignment.regionId === regionId &&
      (assignment.formatId == null || assignment.formatId === formatId),
  );
}

function groupStaffByDivision(
  assignments: LeagueStaffAssignment[],
  regionName: string,
): LeagueStaffByDivision[] {
  const map = new Map<number | 'region', LeagueStaffByDivision & { sortOrder: number }>();

  for (const assignment of assignments) {
    const regionWide = assignment.divisionId == null;
    const key = regionWide ? 'region' : assignment.divisionId;
    if (key !== 'region' && key == null) continue;

    if (!map.has(key)) {
      map.set(key, {
        division: regionWide
          ? { id: null, name: regionName }
          : {
              id: assignment.division!.id,
              name: assignment.division!.name,
            },
        sortOrder: regionWide ? REGION_WIDE_SORT : assignment.division!.sortOrder,
        staff: [],
      });
    }

    const group = map.get(key)!;
    if (group.staff.some((member) => member.steamId === assignment.user.steamId)) continue;

    group.staff.push({
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

  return Array.from(map.values())
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.division.id ?? 0) - (b.division.id ?? 0))
    .map((group) => ({ division: group.division, staff: group.staff }));
}

export function staffForLeagueFromAssignments(
  assignments: LeagueStaffAssignment[],
  formatId: number,
  regionId: number,
  regionName: string,
): LeagueStaffByDivision[] {
  return groupStaffByDivision(
    filterAssignmentsForLeague(assignments, formatId, regionId),
    regionName,
  );
}

export function mapStaffAssignmentForDisplay(
  assignment: StaffAssignmentWithRelations,
): StaffAssignmentDisplay {
  return {
    regionId: assignment.regionId,
    regionName: assignment.region.name,
    formatId: assignment.formatId,
    formatName: assignment.format?.name ?? null,
    divisionId: assignment.divisionId,
    divisionName: assignment.division?.name ?? null,
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
  const collapsed = collapseStaffAssignments(assignments);

  if (collapsed.length > 0) {
    const regionIds = [...new Set(collapsed.map((assignment) => assignment.regionId))];
    const formatIds = [
      ...new Set(
        collapsed.map((assignment) => assignment.formatId).filter((id): id is number => id != null),
      ),
    ];
    const divisionIds = [
      ...new Set(
        collapsed
          .map((assignment) => assignment.divisionId)
          .filter((id): id is number => id != null),
      ),
    ];

    const [regions, formats, divisions, seasonPairs] = await Promise.all([
      prisma.region.findMany({ where: { id: { in: regionIds } }, select: { id: true } }),
      formatIds.length > 0
        ? prisma.format.findMany({ where: { id: { in: formatIds } }, select: { id: true } })
        : Promise.resolve([]),
      divisionIds.length > 0
        ? prisma.division.findMany({
            where: { id: { in: divisionIds } },
            select: { id: true, regionId: true, formatId: true },
          })
        : Promise.resolve([]),
      formatIds.length > 0
        ? prisma.season.findMany({
            where: { formatId: { in: formatIds } },
            select: { formatId: true, regionId: true },
            distinct: ['formatId', 'regionId'],
          })
        : Promise.resolve([]),
    ]);

    const regionSet = new Set(regions.map((region) => region.id));
    const formatSet = new Set(formats.map((format) => format.id));
    const divisionById = new Map(divisions.map((division) => [division.id, division]));
    const seasonSet = new Set(seasonPairs.map((season) => `${season.formatId}:${season.regionId}`));

    for (const assignment of collapsed) {
      if (!regionSet.has(assignment.regionId)) badRequest('Region not found');
      if (assignment.divisionId != null && assignment.formatId == null) {
        badRequest('Division requires a format');
      }
      if (assignment.formatId != null) {
        if (!formatSet.has(assignment.formatId)) badRequest('Format not found');
        if (!seasonSet.has(`${assignment.formatId}:${assignment.regionId}`)) {
          badRequest('That format is not available in the selected region');
        }
      }
      if (assignment.divisionId != null) {
        const division = divisionById.get(assignment.divisionId);
        if (!division) badRequest('Division not found');
        if (division.regionId !== assignment.regionId) {
          badRequest('Division does not belong to that region');
        }
        if (division.formatId !== assignment.formatId) {
          badRequest('Division does not belong to that format');
        }
      }
    }
  }

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({ where: { userId } }),
    ...(collapsed.length > 0
      ? [
          prisma.staffAssignment.createMany({
            data: collapsed.map((assignment) => ({
              userId,
              regionId: assignment.regionId,
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
  const [region, rows] = await Promise.all([
    prisma.region.findUnique({ where: { id: regionId }, select: { name: true } }),
    prisma.staffAssignment.findMany({
      where: {
        regionId,
        OR: [{ formatId }, { formatId: null }],
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
        division: { select: { id: true, name: true, sortOrder: true } },
      },
    }),
  ]);

  if (!region) return [];

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
    region.name,
  );
}
