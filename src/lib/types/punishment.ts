import type { BanStatus } from './user.js';

export type PunishmentSeverity = 'WARNING' | 'SUSPENDED' | 'BANNED';

export type ActiveBanStatus = Exclude<BanStatus, BanStatus.NONE>;

/** Castigo activo visible para el jugador (sin quién lo aplicó). */
export interface PunishmentNotice {
  status: ActiveBanStatus;
  reason: string | null;
  startDateTime: string | null;
  durationDays: number | null;
  endsAt: string | null;
}

/** Fila de historial para staff. */
export interface PunishmentHistoryEntry {
  id: number;
  status: PunishmentSeverity | null;
  reason: string | null;
  startDateTime: string | null;
  durationDays: number | null;
  endsAt: string | null;
  active: boolean;
  punishedBySteamId: string | null;
  punishedByName: string | null;
}
