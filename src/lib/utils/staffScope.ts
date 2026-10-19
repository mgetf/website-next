import type { StaffAssignmentScope } from '#lib/types/staff.js';

export function staffAssignmentKey(assignment: StaffAssignmentScope): string {
  return `${assignment.regionId}:${assignment.formatId ?? ''}:${assignment.divisionId ?? ''}`;
}

function assignmentsEqual(a: StaffAssignmentScope, b: StaffAssignmentScope): boolean {
  return staffAssignmentKey(a) === staffAssignmentKey(b);
}

function isBroaderOrEqual(a: StaffAssignmentScope, b: StaffAssignmentScope): boolean {
  if (a.regionId !== b.regionId) return false;
  if (a.formatId == null) return true;
  if (b.formatId == null || a.formatId !== b.formatId) return false;
  if (a.divisionId == null) return true;
  return b.divisionId == null ? false : a.divisionId === b.divisionId;
}

function isStrictlyBroader(a: StaffAssignmentScope, b: StaffAssignmentScope): boolean {
  return isBroaderOrEqual(a, b) && !assignmentsEqual(a, b);
}

export function collapseStaffAssignments(
  assignments: StaffAssignmentScope[],
): StaffAssignmentScope[] {
  const seen = new Set<string>();
  const unique: StaffAssignmentScope[] = [];
  for (const assignment of assignments) {
    const key = staffAssignmentKey(assignment);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(assignment);
  }
  return unique.filter(
    (assignment) => !unique.some((other) => isStrictlyBroader(other, assignment)),
  );
}

export function serializeStaffAssignmentToken(assignment: StaffAssignmentScope): string {
  if (assignment.formatId == null) return String(assignment.regionId);
  if (assignment.divisionId == null) return `${assignment.regionId}:${assignment.formatId}`;
  return `${assignment.regionId}:${assignment.formatId}:${assignment.divisionId}`;
}
