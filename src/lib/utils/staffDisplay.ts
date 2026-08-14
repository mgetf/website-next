import type { StaffAssignmentDisplay } from '$lib/types/staff';

type StaffDisplayItem = Pick<
  StaffAssignmentDisplay,
  'formatId' | 'formatName' | 'divisionId' | 'divisionName' | 'regionName'
>;

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

function coverageLabel(regions: Map<string, string[]>): string {
  const regionNames = [...regions.keys()];
  const divisions = [...regions.values()].flat();
  if (divisions.length === 1) {
    return `${regionNames[0]} ${divisions[0]}`;
  }
  return regionNames.join('/');
}

export function staffListChips(assignments: StaffDisplayItem[]): StaffListChip[] {
  const map = new Map<number, FormatSummaryAcc>();

  for (const assignment of assignments) {
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
    coverage: coverageLabel(entry.regions),
    title: [...entry.regions.entries()]
      .map(([region, divisions]) => `${region}: ${divisions.join(', ')}`)
      .join(' · '),
  }));
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
