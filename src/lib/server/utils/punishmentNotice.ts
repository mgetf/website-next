import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import type { ActiveBanStatus, PunishmentNotice } from '#lib/types/punishment.js';
import { isActiveBanStatus } from '#lib/utils/punishment.js';

const COOKIE_NAME = 'mge_punishment_notice';
const MAX_AGE_SECONDS = 60 * 15;

type CookiePayload = {
  status: ActiveBanStatus;
  reason: string | null;
  endsAt: string | null;
  durationDays: number | null;
};

export function setPunishmentNoticeCookie(cookies: Cookies, notice: PunishmentNotice): void {
  const payload: CookiePayload = {
    status: notice.status,
    reason: notice.reason,
    endsAt: notice.endsAt,
    durationDays: notice.durationDays,
  };
  cookies.set(COOKIE_NAME, JSON.stringify(payload), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function getPunishmentNoticeCookie(cookies: Cookies): PunishmentNotice | null {
  const raw = cookies.get(COOKIE_NAME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CookiePayload>;
    if (!parsed.status || !isActiveBanStatus(parsed.status)) return null;
    return {
      status: parsed.status,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      startDateTime: null,
      durationDays: typeof parsed.durationDays === 'number' ? parsed.durationDays : null,
      endsAt: typeof parsed.endsAt === 'string' ? parsed.endsAt : null,
    };
  } catch {
    return null;
  }
}
