import type { TeamPageTab } from '$lib/types/team';

export function parseTeamTab(raw: string | null, canManage: boolean): TeamPageTab {
  if (raw === 'management' && canManage) return 'management';
  return 'overview';
}

export function teamRoleName(level: number): string {
  if (level === 2) return 'Owner';
  if (level === 1) return 'Admin';
  return 'Member';
}
