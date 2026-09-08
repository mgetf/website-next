import type { StaffAssignmentDisplay } from '$lib/types/staff';
import { getRegionAbbr, sortRegionsByAbbr } from '$lib/utils/region';

type StaffDisplayItem = Pick<
  StaffAssignmentDisplay,
  'formatId' | 'formatName' | 'divisionId' | 'divisionName' | 'regionName'
> & { regionId?: number };

type StaffListChip = {
  formatId: number;
  formatName: string;
  coverage: string;
  title: string;
};

type StaffDivisionChip = {
  formatId: number;
  divisionId: number;
  divisionName: string;
};

type StaffRegionGroup = {
  regionName: string;
  chips: StaffDivisionChip[];
};

type StaffFormatGroup = {
  formatId: number;
  formatName: string;
  regions: StaffRegionGroup[];
};

type FormatSummaryAcc = {
  formatId: number;
  formatName: string;
  regions: Map<string, string[]>;
};

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
  const map = new Map<number, FormatSummaryAcc>();

  for (const assignment of scoped) {
    let existing = map.get(assignment.formatId);
    if (!existing) {
      existing = {
        formatId: assignment.formatId,
        formatName: assignment.formatName,
        regions: new Map(),
      };
      map.set(assignment.formatId, existing);
    }
    const divisions = existing.regions.get(assignment.regionName) ?? [];
    divisions.push(assignment.divisionName);
    existing.regions.set(assignment.regionName, divisions);
  }

  return [...map.values()].map((entry) => ({
    formatId: entry.formatId,
    formatName: entry.formatName,
    coverage: coverageLabel(entry.regions, omitRegion),
    title: [...entry.regions.entries()]
      .map(([region, divisions]) => `${region}: ${divisions.join(', ')}`)
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

export function groupStaffByFormatAndRegion(assignments: StaffDisplayItem[]): StaffFormatGroup[] {
  const formatOrder: number[] = [];
  const formatNames = new Map<number, string>();
  const regionsByFormat = new Map<number, Map<string, StaffDivisionChip[]>>();

  for (const assignment of assignments) {
    if (!regionsByFormat.has(assignment.formatId)) {
      formatOrder.push(assignment.formatId);
      formatNames.set(assignment.formatId, assignment.formatName);
      regionsByFormat.set(assignment.formatId, new Map());
    }

    const regions = regionsByFormat.get(assignment.formatId)!;
    const chips = regions.get(assignment.regionName) ?? [];
    chips.push({
      formatId: assignment.formatId,
      divisionId: assignment.divisionId,
      divisionName: assignment.divisionName,
    });
    regions.set(assignment.regionName, chips);
  }

  return formatOrder.map((formatId) => ({
    formatId,
    formatName: formatNames.get(formatId) ?? 'Unknown',
    regions: [...(regionsByFormat.get(formatId)?.entries() ?? [])].map(([regionName, chips]) => ({
      regionName,
      chips,
    })),
  }));
}
