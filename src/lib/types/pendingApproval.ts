export type PendingApprovalKind = 'JOIN_REQUEST' | 'ENTRY_READY';

export interface PendingApproval {
  kind: PendingApprovalKind;
  key: string;
  playerSteamId: string;
  playerUsername: string;
  playerAvatar: string | null;
  teamId: number;
  teamName: string;
  formatId: number;
  formatName: string;
  formatThemeKey: string;
  isIndividual: boolean;
  divisionId: number | null;
  divisionName: string | null;
  regionId: number | null;
  regionName: string | null;
  paid: boolean;
}
