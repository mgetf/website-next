import { describe, expect, it } from 'vitest';
import { BanStatus } from '#lib/types/user.js';
import {
  displayPunishmentReason,
  formatPunishmentEndCopy,
  mapPunishmentRecord,
  NO_REASON_ON_RECORD,
  punishmentEndsAt,
  toPunishmentNotice,
} from './punishment';

describe('punishmentEndsAt', () => {
  it('adds duration days to the start date', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    expect(punishmentEndsAt(start, 7)?.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('returns null when duration is missing or not positive', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    expect(punishmentEndsAt(start, null)).toBeNull();
    expect(punishmentEndsAt(start, 0)).toBeNull();
    expect(punishmentEndsAt(null, 7)).toBeNull();
  });
});

describe('mapPunishmentRecord', () => {
  it('maps an active row with a punisher', () => {
    const mapped = mapPunishmentRecord({
      id: 12,
      severity: 'SUSPENDED',
      reason: 'Missed demos',
      startDateTime: new Date('2026-03-01T12:00:00.000Z'),
      duration: 14,
      status: 1,
      punishedBy: '76561198000000002',
      punisher: { steamId: '76561198000000002', steamUsername: 'admin' },
    });

    expect(mapped).toMatchObject({
      id: 12,
      status: 'SUSPENDED',
      reason: 'Missed demos',
      durationDays: 14,
      active: true,
      punishedBySteamId: '76561198000000002',
      punishedByName: 'admin',
      endsAt: '2026-03-15T12:00:00.000Z',
    });
  });
});

describe('toPunishmentNotice', () => {
  it('uses the user status and falls back when there is no row', () => {
    expect(toPunishmentNotice(BanStatus.NONE, null)).toBeNull();
    expect(toPunishmentNotice(BanStatus.BANNED, null)).toEqual({
      status: BanStatus.BANNED,
      reason: null,
      startDateTime: null,
      durationDays: null,
      endsAt: null,
    });
  });
});

describe('display helpers', () => {
  it('uses a fallback when no reason was stored', () => {
    expect(displayPunishmentReason(null)).toBe(NO_REASON_ON_RECORD);
    expect(displayPunishmentReason('   ')).toBe(NO_REASON_ON_RECORD);
    expect(displayPunishmentReason('Cheating')).toBe('Cheating');
  });

  it('says the date does not lift automatically', () => {
    expect(formatPunishmentEndCopy(null)).toMatch(/until staff clears/i);
    expect(formatPunishmentEndCopy('2026-03-15T12:00:00.000Z')).toMatch(
      /Does not lift automatically/,
    );
  });
});
