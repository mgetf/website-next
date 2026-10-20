import type { TeamPageTab } from '#lib/types/team.js';

export function parseTeamTab(
  raw: string | null,
  canManage: boolean,
  isGlobalAdmin = false,
): TeamPageTab {
  if (raw === 'admin' && isGlobalAdmin) return 'admin';
  if (raw === 'management' && canManage) return 'management';
  return 'overview';
}

export const TEAM_ROLE_LEVELS = [0, 1, 2] as const;

export type TeamRoleLevel = (typeof TEAM_ROLE_LEVELS)[number];

export function isTeamRoleLevel(level: number): level is TeamRoleLevel {
  return level === 0 || level === 1 || level === 2;
}

export function teamRoleName(level: number): string {
  if (level === 2) return 'Leader';
  if (level === 1) return 'Co-leader';
  return 'Member';
}
