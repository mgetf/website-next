/**
 * Permission and Authorization Utilities
 * Handles role-based access control
 */

import type { SessionUser } from '$lib/types/user';
import { UserRole, BanStatus } from '$lib/types/user';
import { UserRole as PrismaUserRole } from '$prisma/client.js';
import { prisma } from '../db';
import { unauthorized, forbidden } from '../utils/errors';

/**
 * Check if user has at least the specified role
 */
export function hasRole(user: SessionUser | null, minRole: UserRole): boolean {
  if (!user) return false;

  const roleOrder: Record<UserRole, number> = {
    GUEST: 0,
    MODERATOR: 1,
    ADMIN: 2,
  };

  const userLevel = roleOrder[user.permissionLevel as unknown as UserRole] ?? 0;
  const requiredLevel = roleOrder[minRole];

  return userLevel >= requiredLevel;
}

/**
 * Check if user is an admin or moderator
 */
export function isAdmin(user: SessionUser | null): boolean {
  return hasRole(user, UserRole.MODERATOR);
}

/**
 * Check if user is a strict admin (level 3+)
 */
export function isStrictAdmin(user: SessionUser | null): boolean {
  return hasRole(user, UserRole.ADMIN);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(user: SessionUser | null): boolean {
  return user !== null;
}

/**
 * Check if user is an admin/owner of a specific team
 */
export async function isTeamAdmin(
  user: SessionUser | null,
  teamId: number,
): Promise<boolean> {
  if (!user) return false;

  // Check if user is a global admin/moderator
  if (isAdmin(user)) return true;

  // Check team membership
  const membership = await prisma.playerInTeam.findUnique({
    where: {
      playerSteamId_teamId: {
        playerSteamId: user.steamId,
        teamId: teamId,
      },
    },
  });

  // Permission level ADMIN (1) or STATUS (2) means admin/owner (not just MEMBER which is 0)
  return (
    membership?.active === 1 &&
    (membership.permissionLevel === 1 || membership.permissionLevel === 2)
  );
}

/**
 * Get permission level from database for a Steam ID
 * Useful for initial login or permission checks
 */
export async function getPermissionLevel(steamId: string): Promise<UserRole> {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { permissionLevel: true },
  });

  // Convert Prisma enum to shared enum
  return (user?.permissionLevel as unknown as UserRole) ?? UserRole.GUEST;
}

// ===== Assertion Functions (Throw Errors) =====

/**
 * Require user to be authenticated
 * Throws 401 if not authenticated
 */
export function requireAuth(
  user: SessionUser | null,
): asserts user is SessionUser {
  if (!user) {
    unauthorized('You must be logged in to access this resource');
  }
}

/**
 * Require user to be an admin (moderator or higher)
 * Throws 401 if not authenticated, 403 if not admin
 */
export function requireAdmin(
  user: SessionUser | null,
): asserts user is SessionUser {
  requireAuth(user);
  if (!isAdmin(user)) {
    forbidden('You must be an admin to access this resource');
  }
}

/**
 * Require user to be a strict admin (level 3+)
 * Throws 401 if not authenticated, 403 if not strict admin
 */
export function requireStrictAdmin(
  user: SessionUser | null,
): asserts user is SessionUser {
  requireAuth(user);
  if (!isStrictAdmin(user)) {
    forbidden('You must be a full administrator to access this resource');
  }
}

/**
 * Require user to have at least the specified role
 * Throws 401 if not authenticated, 403 if insufficient permissions
 */
export function requireRole(
  user: SessionUser | null,
  minRole: UserRole,
  message?: string,
): asserts user is SessionUser {
  requireAuth(user);
  if (!hasRole(user, minRole)) {
    forbidden(
      message || `You must have ${minRole} role to access this resource`,
    );
  }
}

/**
 * Require user to be team admin or global admin
 * Throws 401 if not authenticated, 403 if not team admin
 */
export async function requireTeamAdmin(
  user: SessionUser | null,
  teamId: number,
): Promise<void> {
  requireAuth(user);
  const isTeamAdminUser = await isTeamAdmin(user, teamId);
  if (!isTeamAdminUser) {
    forbidden(
      'You must be a team admin or global admin to perform this action',
    );
  }
}

// ===== Ban Check Functions =====

/**
 * Check if user is suspended or banned
 */
export function isBanned(user: SessionUser | null): boolean {
  if (!user) return false;
  return (
    user.banStatus === BanStatus.SUSPENDED ||
    user.banStatus === BanStatus.BANNED
  );
}

/**
 * Require user to not be suspended or banned
 * Throws 401 if not authenticated, 403 if banned/suspended
 */
export function requireNotBanned(
  user: SessionUser | null,
): asserts user is SessionUser {
  requireAuth(user);
  if (isBanned(user)) {
    forbidden(
      'Your account is suspended or banned. You cannot participate in league activities.',
    );
  }
}
