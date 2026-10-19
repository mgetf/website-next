import type { StaffAssignmentDisplay } from '#lib/types/staff.js';
import { getRegionAbbr, sortRegionsByAbbr } from '#lib/utils/region.js';

export const ALL_FORMATS_LABEL = 'All formats';
export const ALL_DIVISIONS_LABEL = 'All divisions';

type StaffDisplayItem = Pick<
  StaffAssignmentDisplay,
  'formatId' | 'formatName' | 'divisionId' | 'divisionName' | 'regionName' | 'regionId'
>;

type StaffListChip = {
  formatId: number | null;
  formatName: string;
  coverage: string;
  title: string;
};

type StaffScopeChip = {
  regionId: number;
  formatId: number | null;
  divisionId: number | null;
  label: string;
};

type StaffFormatGroup = {
  formatId: number | null;
  formatName: string;
  chips: StaffScopeChip[];
};

type StaffRegionGroup = {
  regionId: number;
  regionName: string;
  formats: StaffFormatGroup[];
};

type FormatSummaryAcc = {
  formatId: number | null;
  formatName: string;
  regions: Map<string, string[]>;
};

function formatLabel(assignment: StaffDisplayItem): string {
  return assignment.formatName ?? ALL_FORMATS_LABEL;
}

function divisionLabel(assignment: StaffDisplayItem): string | null {
  if (assignment.formatId == null) return null;
  return assignment.divisionName ?? ALL_DIVISIONS_LABEL;
}

function coverageLabel(regions: Map<string, string[]>, omitRegion: boolean): string {
  const regionNames = [...regions.keys()];
  const divisions = [...regions.values()].flat();
  if (omitRegion) return divisions.join(', ');
  if (divisions.length === 1) {
    return `${regionNames[0]} ${divisions[0]}`;
  }
  return regionNames.join('/');
}

export function staffListChips(
  assignments: StaffDisplayItem[],
  options?: { regionId?: number },
): StaffListChip[] {
  const scoped =
    options?.regionId == null
      ? assignments
      : assignments.filter((assignment) => assignment.regionId === options.regionId);
  const omitRegion = options?.regionId != null;
  const map = new Map<number | 'all', FormatSummaryAcc>();

  for (const assignment of scoped) {
    const key = assignment.formatId ?? 'all';
    let existing = map.get(key);
    if (!existing) {
      existing = {
        formatId: assignment.formatId,
        formatName: formatLabel(assignment),
        regions: new Map(),
      };
      map.set(key, existing);
    }
    const divisions = existing.regions.get(assignment.regionName) ?? [];
    const division = divisionLabel(assignment);
    if (division) divisions.push(division);
    existing.regions.set(assignment.regionName, divisions);
  }

  return [...map.values()].map((entry) => ({
    formatId: entry.formatId,
    formatName: entry.formatName,
    coverage: coverageLabel(entry.regions, omitRegion),
    title: [...entry.regions.entries()]
      .map(([region, divisions]) =>
        divisions.length > 0
          ? `${region}: ${divisions.join(', ')}`
          : `${region}: ${ALL_FORMATS_LABEL.toLowerCase()}`,
      )
      .join(' · '),
  }));
}

type StaffRosterGroupable = {
  steamId: string;
  steamUsername: string;
  permissionLevel: string;
  staffAssignments: StaffAssignmentDisplay[];
};

type StaffRegionRosterGroup<T extends StaffRosterGroupable> = {
  regionId: number | null;
  regionName: string;
  members: T[];
};

export function groupStaffRosterByRegion<T extends StaffRosterGroupable>(
  roster: T[],
  regions: { id: number; name: string }[],
): StaffRegionRosterGroup<T>[] {
  const orderedRegions = sortRegionsByAbbr(
    regions.map((region) => ({ ...region, abbr: getRegionAbbr(region.name) })),
  );

  const groups: StaffRegionRosterGroup<T>[] = [];

  for (const region of orderedRegions) {
    const members = roster.filter((member) =>
      member.staffAssignments.some((assignment) => assignment.regionId === region.id),
    );
    if (members.length === 0) continue;
    groups.push({ regionId: region.id, regionName: region.name, members });
  }

  const unassigned = roster.filter((member) => member.staffAssignments.length === 0);
  if (unassigned.length > 0) {
    groups.push({ regionId: null, regionName: 'No region', members: unassigned });
  }

  return groups;
}

export function groupStaffByRegionAndFormat(assignments: StaffDisplayItem[]): StaffRegionGroup[] {
  const regionOrder: number[] = [];
  const regionNames = new Map<number, string>();
  const formatsByRegion = new Map<number, Map<number | 'all', StaffFormatGroup>>();

  for (const assignment of assignments) {
    if (!formatsByRegion.has(assignment.regionId)) {
      regionOrder.push(assignment.regionId);
      regionNames.set(assignment.regionId, assignment.regionName);
      formatsByRegion.set(assignment.regionId, new Map());
    }

    const formats = formatsByRegion.get(assignment.regionId)!;
    const formatKey = assignment.formatId ?? 'all';
    let formatGroup = formats.get(formatKey);
    if (!formatGroup) {
      formatGroup = {
        formatId: assignment.formatId,
        formatName: formatLabel(assignment),
        chips: [],
      };
      formats.set(formatKey, formatGroup);
    }

    formatGroup.chips.push({
      regionId: assignment.regionId,
      formatId: assignment.formatId,
      divisionId: assignment.divisionId,
      label:
        assignment.formatId == null
          ? ALL_FORMATS_LABEL
          : (assignment.divisionName ?? ALL_DIVISIONS_LABEL),
    });
  }

  return regionOrder.map((regionId) => ({
    regionId,
    regionName: regionNames.get(regionId) ?? 'Unknown',
    formats: [...(formatsByRegion.get(regionId)?.values() ?? [])],
  }));
}
