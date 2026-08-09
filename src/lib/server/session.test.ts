import { beforeAll, describe, expect, it } from 'vitest';
import { getAndClearRedirectUrl, getSession, setRedirectUrl, setSession } from './session';
import { BanStatus, UserRole, type SessionUser } from '$lib/types/user';

type CookieStore = Map<string, { value: string; opts?: Record<string, unknown> }>;

function mockCookies(store: CookieStore = new Map()) {
  return {
    get: (name: string) => store.get(name)?.value,
    set: (name: string, value: string, opts?: Record<string, unknown>) => {
      store.set(name, { value, opts });
    },
    delete: (name: string) => {
      store.delete(name);
    },
    store,
  };
}

const sampleUser: SessionUser = {
  steamId: '76561198000000001',
  steamUsername: 'player',
  steamAvatar: '',
  permissionLevel: UserRole.GUEST,
  banStatus: BanStatus.NONE,
  sessionVersion: 1,
};

beforeAll(() => {
  process.env.SESSION_SECRET ??= 'test-session-secret-at-least-32-chars!!';
});

describe('signed session cookies', () => {
  it('round-trips a session through HMAC signing', () => {
    const cookies = mockCookies();
    setSession(cookies as never, sampleUser);
    const restored = getSession(cookies as never);
    expect(restored).toEqual(sampleUser);

    const stored = cookies.store.get('mge_session');
    expect(stored?.opts).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('rejects tampered session payloads', () => {
    const cookies = mockCookies();
    setSession(cookies as never, sampleUser);
    const signed = cookies.store.get('mge_session')!.value;
    const [payload, signature] = signed.split('.');
    cookies.store.set('mge_session', {
      value: `${payload}.${signature!.slice(0, -1)}x`,
    });
    expect(getSession(cookies as never)).toBeNull();
    expect(cookies.store.has('mge_session')).toBe(false);
  });

  it('sanitizes redirect URLs stored in cookies', () => {
    const cookies = mockCookies();
    setRedirectUrl(cookies as never, 'https://evil.example');
    expect(getAndClearRedirectUrl(cookies as never)).toBe('/');
  });
});
