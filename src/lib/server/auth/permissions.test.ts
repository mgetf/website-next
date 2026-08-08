import { describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { BanStatus, UserRole, type SessionUser } from '$lib/types/user';
import {
  canModerateUser,
  hasRole,
  isAdmin,
  isBanned,
  isStrictAdmin,
  requireAdmin,
  requireAuth,
  requireCanModerateUser,
  requireNotBanned,
  requireStrictAdmin,
} from '../auth/permissions';

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    steamId: '76561198000000001',
    steamUsername: 'player',
    steamAvatar: '',
    permissionLevel: UserRole.GUEST,
    banStatus: BanStatus.NONE,
    ...overrides,
  };
}

function statusOf(fn: () => void): number | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (isHttpError(err)) return err.status;
    throw err;
  }
}

describe('role helpers', () => {
  it('evaluates role hierarchy', () => {
    expect(hasRole(null, UserRole.GUEST)).toBe(false);
    expect(hasRole(user(), UserRole.MODERATOR)).toBe(false);
    expect(hasRole(user({ permissionLevel: UserRole.MODERATOR }), UserRole.MODERATOR)).toBe(true);
    expect(hasRole(user({ permissionLevel: UserRole.ADMIN }), UserRole.MODERATOR)).toBe(true);
  });

  it('detects admin tiers', () => {
    expect(isAdmin(user({ permissionLevel: UserRole.MODERATOR }))).toBe(true);
    expect(isAdmin(user())).toBe(false);
    expect(isStrictAdmin(user({ permissionLevel: UserRole.ADMIN }))).toBe(true);
    expect(isStrictAdmin(user({ permissionLevel: UserRole.MODERATOR }))).toBe(false);
  });
});

describe('ban helpers', () => {
  it('treats suspended and banned as banned', () => {
    expect(isBanned(null)).toBe(false);
    expect(isBanned(user({ banStatus: BanStatus.WARNING }))).toBe(false);
    expect(isBanned(user({ banStatus: BanStatus.SUSPENDED }))).toBe(true);
    expect(isBanned(user({ banStatus: BanStatus.BANNED }))).toBe(true);
  });
});

describe('require* guards', () => {
  it('requireAuth throws 401 for anonymous users', () => {
    expect(statusOf(() => requireAuth(null))).toBe(401);
    expect(statusOf(() => requireAuth(user()))).toBeNull();
  });

  it('requireAdmin enforces moderator+', () => {
    expect(statusOf(() => requireAdmin(null))).toBe(401);
    expect(statusOf(() => requireAdmin(user()))).toBe(403);
    expect(statusOf(() => requireAdmin(user({ permissionLevel: UserRole.MODERATOR })))).toBeNull();
  });

  it('requireStrictAdmin enforces admin only', () => {
    expect(statusOf(() => requireStrictAdmin(user({ permissionLevel: UserRole.MODERATOR })))).toBe(
      403,
    );
    expect(
      statusOf(() => requireStrictAdmin(user({ permissionLevel: UserRole.ADMIN }))),
    ).toBeNull();
  });

  it('requireNotBanned blocks suspended and banned accounts', () => {
    expect(statusOf(() => requireNotBanned(null))).toBe(401);
    expect(statusOf(() => requireNotBanned(user({ banStatus: BanStatus.BANNED })))).toBe(403);
    expect(statusOf(() => requireNotBanned(user()))).toBeNull();
  });
});

describe('staff moderation guards', () => {
  it('allows moderators to moderate guests only', () => {
    const mod = user({ permissionLevel: UserRole.MODERATOR });
    expect(canModerateUser(mod, UserRole.GUEST)).toBe(true);
    expect(canModerateUser(mod, UserRole.MODERATOR)).toBe(false);
    expect(canModerateUser(mod, UserRole.ADMIN)).toBe(false);
  });

  it('allows admins to moderate staff', () => {
    const admin = user({ permissionLevel: UserRole.ADMIN });
    expect(canModerateUser(admin, UserRole.MODERATOR)).toBe(true);
    expect(canModerateUser(admin, UserRole.ADMIN)).toBe(true);
  });

  it('requireCanModerateUser blocks mods targeting staff', () => {
    const mod = user({ permissionLevel: UserRole.MODERATOR });
    expect(statusOf(() => requireCanModerateUser(mod, UserRole.ADMIN))).toBe(403);
    expect(statusOf(() => requireCanModerateUser(mod, UserRole.GUEST))).toBeNull();
  });
});
