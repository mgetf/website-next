/**
 * Permission and Authorization Utilities
 * Handles role-based access control
 */

import type { SessionUser } from '../session';
import { UserRole } from '@prisma/client';
import { prisma } from '../db';

/**
 * Check if user has at least the specified role
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
	teamId: number
): Promise<boolean> {
	if (!user) return false;

	// Check if user is a global admin/moderator
	if (isAdmin(user)) return true;

	// Check team membership
	const membership = await prisma.playerInTeam.findUnique({
		where: {
			playerSteamId_teamId: {
				playerSteamId: user.steamId,
				teamId: teamId
			}
		}
	});

	// Permission level >= 1 means admin/owner
	return membership?.active === 1 && membership.permissionLevel >= 1;
}

/**
 * Get permission level from database for a Steam ID
 * Useful for initial login or permission checks
 */
export async function getPermissionLevel(steamId: string): Promise<UserRole> {
	const user = await prisma.user.findUnique({
		where: { steamId },
		select: { permissionLevel: true }
	});

	return user?.permissionLevel ?? UserRole.GUEST;
}

