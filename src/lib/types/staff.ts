export interface StaffAssignmentDisplay {
  formatId: number;
  formatName: string;
  divisionId: number;
  divisionName: string;
  regionId: number;
  regionName: string;
}

export type StaffSyncStatusDisplay = 'OK' | 'PENDING' | 'ERROR' | 'SKIPPED';

export interface OrphanManagedDiscordMember {
  discordId: string;
  username: string;
  displayName: string;
  roleIds: string[];
  roleNames: string[];
  linkedSteamId: string | null;
  linkedSteamUsername: string | null;
}

export interface OrphanManagedDiscordAudit {
  configured: boolean;
  error: string | null;
  members: OrphanManagedDiscordMember[];
}
