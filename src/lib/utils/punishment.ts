import { BanStatus } from '#lib/types/user.js';
import type {
  ActiveBanStatus,
  PunishmentHistoryEntry,
  PunishmentNotice,
  PunishmentSeverity,
} from '#lib/types/punishment.js';

export const NO_REASON_ON_RECORD = 'No reason on record';

export type PunishmentRow = {
  id: number;
  severity: PunishmentSeverity | null;
  reason: string | null;
  startDateTime: Date | string | null;
  duration: number | null;
  status: number | null;
  punishedBy?: string | null;
  punisher?: { steamId: string; steamUsername: string } | null;
};

export function isActiveBanStatus(status: string): status is ActiveBanStatus {
  return (
    status === BanStatus.WARNING || status === BanStatus.SUSPENDED || status === BanStatus.BANNED
  );
}

export function punishmentEndsAt(
  start: Date | string | null | undefined,
  durationDays: number | null | undefined,
): Date | null {
  if (!start || durationDays == null || !Number.isFinite(durationDays) || durationDays <= 0) {
    return null;
  }
  const startDate = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const end = new Date(startDate.getTime());
  end.setUTCDate(end.getUTCDate() + durationDays);
  return end;
}

export function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function mapPunishmentRecord(row: PunishmentRow): PunishmentHistoryEntry {
  const startIso = toIsoOrNull(row.startDateTime);
  const ends = punishmentEndsAt(row.startDateTime, row.duration);
  return {
    id: row.id,
    status: row.severity,
    reason: row.reason,
    startDateTime: startIso,
    durationDays: row.duration,
    endsAt: ends ? ends.toISOString() : null,
    active: row.status === 1,
    punishedBySteamId: row.punishedBy ?? row.punisher?.steamId ?? null,
    punishedByName: row.punisher?.steamUsername ?? null,
  };
}

export function toPunishmentNotice(
  banStatus: string,
  row: PunishmentRow | PunishmentHistoryEntry | null,
): PunishmentNotice | null {
  if (!isActiveBanStatus(banStatus)) return null;
  if (!row) {
    return {
      status: banStatus,
      reason: null,
      startDateTime: null,
      durationDays: null,
      endsAt: null,
    };
  }
  const mapped = 'active' in row ? row : mapPunishmentRecord(row);
  return {
    status: banStatus,
    reason: mapped.reason,
    startDateTime: mapped.startDateTime,
    durationDays: mapped.durationDays,
    endsAt: mapped.endsAt,
  };
}

export function punishmentStatusLabel(status: string): string {
  switch (status) {
    case BanStatus.WARNING:
      return 'Warning';
    case BanStatus.SUSPENDED:
      return 'Suspended';
    case BanStatus.BANNED:
      return 'Banned';
    default:
      return 'Active';
  }
}

export function formatPunishmentEndCopy(endsAtIso: string | null): string {
  if (!endsAtIso) {
    return 'No end date. Stays until staff clears it.';
  }
  const date = new Date(endsAtIso);
  const formatted = date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `Until ${formatted}. Does not lift automatically.`;
}

export function displayPunishmentReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim();
  return trimmed ? trimmed : NO_REASON_ON_RECORD;
}
