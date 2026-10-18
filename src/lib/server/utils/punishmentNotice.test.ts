import { describe, expect, it } from 'vitest';
import { BanStatus } from '#lib/types/user.js';
import { getPunishmentNoticeCookie, setPunishmentNoticeCookie } from './punishmentNotice.js';

type CookieStore = Map<string, { value: string }>;

function mockCookies(store: CookieStore = new Map()) {
  return {
    get: (name: string) => store.get(name)?.value,
    set: (name: string, value: string) => {
      store.set(name, { value });
    },
    delete: (name: string) => {
      store.delete(name);
    },
    store,
  };
}

describe('punishment notice cookie', () => {
  it('round-trips status, reason, and end date', () => {
    const cookies = mockCookies();
    setPunishmentNoticeCookie(cookies as never, {
      status: BanStatus.SUSPENDED,
      reason: 'Missed demos',
      startDateTime: '2026-03-01T00:00:00.000Z',
      durationDays: 7,
      endsAt: '2026-03-08T00:00:00.000Z',
    });

    expect(getPunishmentNoticeCookie(cookies as never)).toEqual({
      status: BanStatus.SUSPENDED,
      reason: 'Missed demos',
      startDateTime: null,
      durationDays: 7,
      endsAt: '2026-03-08T00:00:00.000Z',
    });
  });

  it('ignores invalid payloads', () => {
    const cookies = mockCookies();
    cookies.set('mge_punishment_notice', '{not json');
    expect(getPunishmentNoticeCookie(cookies as never)).toBeNull();
  });
});
