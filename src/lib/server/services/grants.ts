/**
 * Grants Service
 *
 * CRUD operations for authorization grants.
 * Grants are the fundamental building block of the ReBAC system.
 *
 * @module grants
 */

import { prisma } from '$lib/server/db';
import { clearCache, clearCacheFor } from '$lib/server/auth/rebac';

// =============================================================================
// Types
// =============================================================================

export interface CreateGrantInput {
	subjectType: 'user' | 'team' | 'role';
	subjectId: string;
	relation: string;
	objectType: string;
	objectId: string;
	grantedBy?: string;
	expiresAt?: Date;
	note?: string;
}

export interface GrantFilter {
	subjectType?: string;
	subjectId?: string;
	relation?: string;
	objectType?: string;
	objectId?: string;
	includeExpired?: boolean;
}

// =============================================================================
// Standard Relations
// =============================================================================

/**
 * Standard relation types used in the system.
 * Using constants helps prevent typos and enables autocomplete.
 */
export const Relations = {
	// Ownership and membership
	OWNER: 'owner',
	ADMIN: 'admin',
	MEMBER: 'member',
	VIEWER: 'viewer',

	// Staff roles
	MODERATOR: 'moderator',

	// Participation
	PARTICIPANT: 'participant',
	HOME_TEAM: 'home_team',
	AWAY_TEAM: 'away_team'
} as const;

/**
 * Standard object types used in the system.
 */
export const ObjectTypes = {
	USER: 'user',
	TEAM: 'team',
	MATCH: 'match',
	DIVISION: 'division',
	REGION: 'region',
	SEASON: 'season',
	TOURNAMENT: 'tournament',
	CHAMPIONSHIP: 'championship',
	ROLE: 'role',
	GLOBAL: 'global'
} as const;

// =============================================================================
// Create Operations
// =============================================================================

/**
 * Create a new grant.
 *
 * @throws If the grant already exists (unique constraint)
 *
 * @example
 * ```ts
 * // Make Tommy the owner of team 123
 * await createGrant({
 *   subjectType: 'user',
 *   subjectId: '76561198012345678',
 *   relation: 'owner',
 *   objectType: 'team',
 *   objectId: '123',
 *   grantedBy: adminSteamId
 * });
 * ```
 */
export async function createGrant(input: CreateGrantInput) {
	const grant = await prisma.grant.create({
		data: {
			subjectType: input.subjectType,
			subjectId: input.subjectId,
			relation: input.relation,
			objectType: input.objectType,
			objectId: input.objectId,
			grantedBy: input.grantedBy,
			expiresAt: input.expiresAt,
			note: input.note
		}
	});

	// Clear cache for affected resources
	clearCacheFor(input.objectType, input.objectId);

	return grant;
}

/**
 * Create a grant if it doesn't already exist (upsert behavior).
 * Returns the existing grant if found, otherwise creates a new one.
 */
export async function ensureGrant(input: CreateGrantInput) {
	const existing = await prisma.grant.findUnique({
		where: {
			subjectType_subjectId_relation_objectType_objectId: {
				subjectType: input.subjectType,
				subjectId: input.subjectId,
				relation: input.relation,
				objectType: input.objectType,
				objectId: input.objectId
			}
		}
	});

	if (existing) {
		// Update expiration if provided and different
		if (input.expiresAt !== undefined && existing.expiresAt !== input.expiresAt) {
			return prisma.grant.update({
				where: { id: existing.id },
				data: { expiresAt: input.expiresAt }
			});
		}
		return existing;
	}

	return createGrant(input);
}

/**
 * Create multiple grants in a transaction.
 */
export async function createGrants(inputs: CreateGrantInput[]) {
	const grants = await prisma.$transaction(
		inputs.map((input) =>
			prisma.grant.create({
				data: {
					subjectType: input.subjectType,
					subjectId: input.subjectId,
					relation: input.relation,
					objectType: input.objectType,
					objectId: input.objectId,
					grantedBy: input.grantedBy,
					expiresAt: input.expiresAt,
					note: input.note
				}
			})
		)
	);

	// Clear full cache since multiple resources may be affected
	clearCache();

	return grants;
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get a grant by ID.
 */
export async function getGrant(id: number) {
	return prisma.grant.findUnique({
		where: { id }
	});
}

/**
 * Find grants matching a filter.
 */
export async function findGrants(filter: GrantFilter) {
	const now = new Date();

	return prisma.grant.findMany({
		where: {
			...(filter.subjectType && { subjectType: filter.subjectType }),
			...(filter.subjectId && { subjectId: filter.subjectId }),
			...(filter.relation && { relation: filter.relation }),
			...(filter.objectType && { objectType: filter.objectType }),
			...(filter.objectId && { objectId: filter.objectId }),
			...(!filter.includeExpired && {
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
			})
		},
		orderBy: { grantedAt: 'desc' }
	});
}

/**
 * Get all grants for a subject (user, team, or role).
 */
export async function getGrantsForSubject(
	subjectType: string,
	subjectId: string,
	options?: { includeExpired?: boolean }
) {
	return findGrants({
		subjectType,
		subjectId,
		includeExpired: options?.includeExpired
	});
}

/**
 * Get all grants on an object (what permissions exist on this resource).
 */
export async function getGrantsOnObject(
	objectType: string,
	objectId: string,
	options?: { includeExpired?: boolean }
) {
	return findGrants({
		objectType,
		objectId,
		includeExpired: options?.includeExpired
	});
}

/**
 * Get all users with a specific relation to an object.
 * Useful for listing team owners, division moderators, etc.
 */
export async function getUsersWithRelation(objectType: string, objectId: string, relation: string) {
	const grants = await findGrants({
		subjectType: 'user',
		objectType,
		objectId,
		relation
	});

	return grants.map((g) => g.subjectId);
}

/**
 * Check if a specific grant exists.
 */
export async function hasGrant(
	subjectType: string,
	subjectId: string,
	relation: string,
	objectType: string,
	objectId: string
): Promise<boolean> {
	const now = new Date();

	const grant = await prisma.grant.findFirst({
		where: {
			subjectType,
			subjectId,
			relation,
			objectType,
			objectId: { in: [objectId, '*'] },
			OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
		}
	});

	return !!grant;
}

// =============================================================================
// Update Operations
// =============================================================================

/**
 * Update a grant's expiration or note.
 */
export async function updateGrant(
	id: number,
	data: {
		expiresAt?: Date | null;
		note?: string | null;
	}
) {
	const grant = await prisma.grant.update({
		where: { id },
		data
	});

	clearCacheFor(grant.objectType, grant.objectId);

	return grant;
}

/**
 * Extend a grant's expiration.
 */
export async function extendGrant(id: number, newExpiresAt: Date) {
	return updateGrant(id, { expiresAt: newExpiresAt });
}

/**
 * Make a temporary grant permanent.
 */
export async function makeGrantPermanent(id: number) {
	return updateGrant(id, { expiresAt: null });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Delete a grant by ID.
 */
export async function deleteGrant(id: number) {
	const grant = await prisma.grant.delete({
		where: { id }
	});

	clearCacheFor(grant.objectType, grant.objectId);

	return grant;
}

/**
 * Revoke a specific grant.
 */
export async function revokeGrant(
	subjectType: string,
	subjectId: string,
	relation: string,
	objectType: string,
	objectId: string
) {
	const grant = await prisma.grant.deleteMany({
		where: {
			subjectType,
			subjectId,
			relation,
			objectType,
			objectId
		}
	});

	clearCacheFor(objectType, objectId);

	return grant;
}

/**
 * Revoke all grants for a subject.
 * Use with caution - this removes ALL permissions.
 */
export async function revokeAllForSubject(subjectType: string, subjectId: string) {
	const result = await prisma.grant.deleteMany({
		where: { subjectType, subjectId }
	});

	clearCache();

	return result;
}

/**
 * Revoke all grants on an object.
 * Useful when deleting a resource.
 */
export async function revokeAllOnObject(objectType: string, objectId: string) {
	const result = await prisma.grant.deleteMany({
		where: { objectType, objectId }
	});

	clearCacheFor(objectType, objectId);

	return result;
}

/**
 * Revoke a specific relation from a subject on all objects.
 * E.g., remove "moderator" from a user on all divisions.
 */
export async function revokeRelationFromSubject(
	subjectType: string,
	subjectId: string,
	relation: string
) {
	const result = await prisma.grant.deleteMany({
		where: { subjectType, subjectId, relation }
	});

	clearCache();

	return result;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Clean up expired grants.
 * Should be run periodically (e.g., daily cron job).
 */
export async function cleanupExpiredGrants() {
	const result = await prisma.grant.deleteMany({
		where: {
			expiresAt: {
				lt: new Date()
			}
		}
	});

	if (result.count > 0) {
		clearCache();
	}

	return result;
}

/**
 * Transfer all grants from one subject to another.
 * Useful when transferring team ownership or replacing a user.
 */
export async function transferGrants(
	fromSubjectType: string,
	fromSubjectId: string,
	toSubjectType: string,
	toSubjectId: string,
	options?: { relations?: string[] }
) {
	const grants = await findGrants({
		subjectType: fromSubjectType,
		subjectId: fromSubjectId,
		...(options?.relations && { relation: { in: options.relations } as unknown as string })
	});

	// Create new grants for the target subject
	const newGrants = await createGrants(
		grants.map((g) => ({
			subjectType: toSubjectType as 'user' | 'team' | 'role',
			subjectId: toSubjectId,
			relation: g.relation,
			objectType: g.objectType,
			objectId: g.objectId,
			note: `Transferred from ${fromSubjectType}:${fromSubjectId}`
		}))
	);

	// Delete original grants
	await prisma.grant.deleteMany({
		where: {
			id: { in: grants.map((g) => g.id) }
		}
	});

	clearCache();

	return newGrants;
}

// =============================================================================
// Role Helpers
// =============================================================================

/**
 * Add a user to a role.
 */
export async function addUserToRole(userId: string, roleName: string, grantedBy?: string) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.MEMBER,
		objectType: ObjectTypes.ROLE,
		objectId: roleName,
		grantedBy
	});
}

/**
 * Remove a user from a role.
 */
export async function removeUserFromRole(userId: string, roleName: string) {
	return revokeGrant('user', userId, Relations.MEMBER, ObjectTypes.ROLE, roleName);
}

/**
 * Get all users in a role.
 */
export async function getUsersInRole(roleName: string) {
	return getUsersWithRelation(ObjectTypes.ROLE, roleName, Relations.MEMBER);
}

/**
 * Grant a permission to a role.
 */
export async function grantToRole(
	roleName: string,
	relation: string,
	objectType: string,
	objectId: string,
	grantedBy?: string
) {
	return ensureGrant({
		subjectType: 'role',
		subjectId: roleName,
		relation,
		objectType,
		objectId,
		grantedBy
	});
}

// =============================================================================
// Convenience Helpers
// =============================================================================

/**
 * Make a user a global admin.
 */
export async function makeGlobalAdmin(userId: string, grantedBy?: string) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.ADMIN,
		objectType: ObjectTypes.GLOBAL,
		objectId: '*',
		grantedBy
	});
}

/**
 * Make a user a division moderator.
 */
export async function makeDivisionModerator(
	userId: string,
	divisionId: number | string,
	grantedBy?: string
) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.MODERATOR,
		objectType: ObjectTypes.DIVISION,
		objectId: String(divisionId),
		grantedBy
	});
}

/**
 * Make a user a region admin.
 */
export async function makeRegionAdmin(
	userId: string,
	regionId: number | string,
	grantedBy?: string
) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.ADMIN,
		objectType: ObjectTypes.REGION,
		objectId: String(regionId),
		grantedBy
	});
}

/**
 * Make a user a team owner.
 */
export async function makeTeamOwner(userId: string, teamId: number | string, grantedBy?: string) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.OWNER,
		objectType: ObjectTypes.TEAM,
		objectId: String(teamId),
		grantedBy
	});
}

/**
 * Make a user a team admin (can manage but not transfer ownership).
 */
export async function makeTeamAdmin(userId: string, teamId: number | string, grantedBy?: string) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.ADMIN,
		objectType: ObjectTypes.TEAM,
		objectId: String(teamId),
		grantedBy
	});
}

/**
 * Make a user a team member.
 */
export async function makeTeamMember(userId: string, teamId: number | string, grantedBy?: string) {
	return ensureGrant({
		subjectType: 'user',
		subjectId: userId,
		relation: Relations.MEMBER,
		objectType: ObjectTypes.TEAM,
		objectId: String(teamId),
		grantedBy
	});
}

/**
 * Check if a user is a global admin.
 */
export async function isGlobalAdmin(userId: string): Promise<boolean> {
	return hasGrant('user', userId, Relations.ADMIN, ObjectTypes.GLOBAL, '*');
}

/**
 * Check if a user is a division moderator.
 */
export async function isDivisionModerator(
	userId: string,
	divisionId?: number | string
): Promise<boolean> {
	const objectId = divisionId ? String(divisionId) : '*';
	return hasGrant('user', userId, Relations.MODERATOR, ObjectTypes.DIVISION, objectId);
}

