/**
 * Permission and Authorization Utilities
 *
 * This module provides backwards-compatible permission checking functions
 * that wrap the new ReBAC (Relationship-Based Access Control) system.
 *
 * MIGRATION STATUS:
 * - Legacy functions (hasRole, isAdmin, etc.) are preserved for compatibility
 * - New code should use the ReBAC functions: can(), require() from ./rebac
 * - The legacy User.permissionLevel field is still checked as a fallback
 *   until all existing permissions are migrated to grants
 *
 * @module permissions
 */

import type { SessionUser } from '$lib/types/user';
import { UserRole } from '$lib/types/user';
import { UserRole as PrismaUserRole } from '$prisma/client.js';
import { prisma } from '../db';
import { unauthorized, forbidden } from '../utils/errors';
import { can as rebackCan, require as rebacRequire } from './rebac';
import { isGlobalAdmin, isDivisionModerator } from '../services/grants';

// =============================================================================
// ReBAC Integration (New Way)
// =============================================================================

/**
 * Check if a user has a capability on a resource using ReBAC.
 * This is the preferred way to check permissions in new code.
 *
 * @example
 * ```ts
 * if (await can(user, 'team:edit', { type: 'team', id: teamId })) {
 *   // allowed
 * }
 * ```
 */
export { can, check, require as requireCapability } from './rebac';

// =============================================================================
// Legacy Permission Functions (Backwards Compatible)
// =============================================================================

/**
 * Check if user has at least the specified role.
 *
 * @deprecated Use `can(userId, capability, resource)` instead.
 * This function checks the legacy User.permissionLevel field AND the new grants.
 */
export function hasRole(user: SessionUser | null, minRole: UserRole): boolean {
	if (!user) return false;

	const roleOrder: Record<UserRole, number> = {
		GUEST: 0,
		USER: 1,
		MODERATOR: 2,
		ADMIN: 3
	};

	const userLevel = roleOrder[user.permissionLevel as unknown as UserRole] ?? 0;
	const requiredLevel = roleOrder[minRole];

	return userLevel >= requiredLevel;
}

/**
 * Check if user is an admin or moderator (legacy).
 *
 * @deprecated Use `can(userId, 'admin:access', { type: 'global', id: '*' })` instead.
 */
export function isAdmin(user: SessionUser | null): boolean {
	return hasRole(user, UserRole.MODERATOR);
}

/**
 * Check if user is a strict admin (ADMIN role only).
 *
 * @deprecated Use `can(userId, 'site:edit_settings', { type: 'global', id: '*' })` instead.
 */
export function isStrictAdmin(user: SessionUser | null): boolean {
	return hasRole(user, UserRole.ADMIN);
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated(user: SessionUser | null): boolean {
	return user !== null;
}

/**
 * Check if user is an admin/owner of a specific team.
 *
 * This function checks BOTH:
 * 1. Legacy PlayerInTeam.permissionLevel field
 * 2. New ReBAC grants (team:owner, team:admin)
 *
 * @deprecated Use `can(userId, 'team:edit', { type: 'team', id: teamId })` instead.
 */
export async function isTeamAdmin(user: SessionUser | null, teamId: number): Promise<boolean> {
	if (!user) return false;

	// Check if user is a global admin/moderator (legacy)
	if (isAdmin(user)) return true;

	// Check new ReBAC grants first
	const hasRebackGrant = await rebackCan(user.steamId, 'team:edit', { type: 'team', id: teamId });
	if (hasRebackGrant) return true;

	// Fallback: Check legacy team membership
	const membership = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: user.steamId,
				teamId: teamId
			}
		}
	});

	// Permission level ADMIN (1) or STATUS (2) means admin/owner (not just MEMBER which is 0)
	return membership?.active === 1 && (membership.permissionLevel === 1 || membership.permissionLevel === 2);
}

/**
 * Get permission level from database for a Steam ID.
 * Used during login to set session data.
 *
 * NOTE: This returns the legacy permissionLevel. For full permission info,
 * query the grants table.
 */
export async function getPermissionLevel(steamId: string): Promise<UserRole> {
	const user = await prisma.user.findUnique({
		where: { steamId },
		select: { permissionLevel: true }
	});

	// Convert Prisma enum to shared enum
	return (user?.permissionLevel as unknown as UserRole) ?? UserRole.GUEST;
}

/**
 * Check if a user has admin access using ReBAC.
 * Checks for global admin OR any division moderator grants.
 */
export async function hasAdminAccess(userId: string): Promise<boolean> {
	// Check global admin
	if (await isGlobalAdmin(userId)) return true;

	// Check any division moderator
	if (await isDivisionModerator(userId)) return true;

	return false;
}

// =============================================================================
// Assertion Functions (Throw Errors)
// =============================================================================

/**
 * Require user to be authenticated.
 * Throws 401 if not authenticated.
 */
export function requireAuth(user: SessionUser | null): asserts user is SessionUser {
	if (!user) {
		unauthorized('You must be logged in to access this resource');
	}
}

/**
 * Require user to be an admin (moderator or higher).
 * Throws 401 if not authenticated, 403 if not admin.
 *
 * NOTE: This checks the legacy permissionLevel. For new code, use:
 * `await requireCapability(userId, 'admin:access', { type: 'global', id: '*' })`
 */
export function requireAdmin(user: SessionUser | null): asserts user is SessionUser {
	requireAuth(user);
	if (!isAdmin(user)) {
		forbidden('You must be an admin to access this resource');
	}
}

/**
 * Require user to be an admin using ReBAC (async version).
 * Checks both legacy permissionLevel AND new grants.
 */
export async function requireAdminAsync(user: SessionUser | null): Promise<void> {
	requireAuth(user);

	// Check legacy first (fast path)
	if (isAdmin(user)) return;

	// Check ReBAC grants
	const hasAccess = await hasAdminAccess(user.steamId);
	if (!hasAccess) {
		forbidden('You must be an admin to access this resource');
	}
}

/**
 * Require user to be a strict admin (level 3+).
 * Throws 401 if not authenticated, 403 if not strict admin.
 */
export function requireStrictAdmin(user: SessionUser | null): asserts user is SessionUser {
	requireAuth(user);
	if (!isStrictAdmin(user)) {
		forbidden('You must be a full administrator to access this resource');
	}
}

/**
 * Require user to be a strict admin using ReBAC (async version).
 */
export async function requireStrictAdminAsync(user: SessionUser | null): Promise<void> {
	requireAuth(user);

	// Check legacy first
	if (isStrictAdmin(user)) return;

	// Check ReBAC grants
	if (await isGlobalAdmin(user.steamId)) return;

	forbidden('You must be a full administrator to access this resource');
}

/**
 * Require user to have at least the specified role.
 * Throws 401 if not authenticated, 403 if insufficient permissions.
 *
 * @deprecated Use capability-based checks instead.
 */
export function requireRole(
	user: SessionUser | null,
	minRole: UserRole,
	message?: string
): asserts user is SessionUser {
	requireAuth(user);
	if (!hasRole(user, minRole)) {
		forbidden(message || `You must have ${minRole} role to access this resource`);
	}
}

/**
 * Require user to be team admin or global admin.
 * Throws 401 if not authenticated, 403 if not team admin.
 */
export async function requireTeamAdmin(user: SessionUser | null, teamId: number): Promise<void> {
	requireAuth(user);
	const isTeamAdminUser = await isTeamAdmin(user, teamId);
	if (!isTeamAdminUser) {
		forbidden('You must be a team admin or global admin to perform this action');
	}
}

/**
 * Require a specific capability on a resource.
 * This is the preferred way to check permissions in new code.
 *
 * @example
 * ```ts
 * await requireCan(user, 'match:submit_score', { type: 'match', id: matchId });
 * ```
 */
export async function requireCan(
	user: SessionUser | null,
	capability: string,
	resource: { type: string; id: string | number }
): Promise<void> {
	requireAuth(user);
	await rebacRequire(user.steamId, capability, resource);
}

