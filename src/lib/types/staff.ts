export interface StaffAssignmentScope {
  regionId: number;
  formatId: number | null;
  divisionId: number | null;
}

export interface StaffAssignmentDisplay extends StaffAssignmentScope {
  regionName: string;
  formatName: string | null;
  divisionName: string | null;
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
  /** When Discord was last asked for the member list. Null until the first refresh. */
  fetchedAt: string | null;
}
