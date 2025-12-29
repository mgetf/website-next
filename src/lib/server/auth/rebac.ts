/**
 * ReBAC (Relationship-Based Access Control) Authorization Engine
 *
 * This module implements a graph-based authorization system inspired by Google Zanzibar.
 * Authorization is performed by traversing a directed graph of relationships (grants).
 *
 * Core concepts:
 * - **Grant**: A tuple (subject, relation, object) stored in the database
 * - **Capability**: A named permission that can be checked (e.g., "team:edit")
 * - **Path**: A way to derive permission through relationship traversal
 *
 * Example grants:
 * - (user:tommy, owner, team:123) - Tommy owns team 123
 * - (user:sarah, moderator, division:1) - Sarah moderates division 1
 * - (role:staff, moderator, division:*) - Staff role has moderator on all divisions
 *
 * @module rebac
 */

import { prisma } from '../db';
import { capabilities, type ResourceRef } from './capabilities';

// =============================================================================
// Types
// =============================================================================

export interface GrantInput {
	subjectType: 'user' | 'team' | 'role';
	subjectId: string;
	relation: string;
	objectType: string;
	objectId: string;
	grantedBy?: string;
	expiresAt?: Date;
	note?: string;
}

export interface CheckResult {
	allowed: boolean;
	reason?: string;
	path?: string; // The path that granted access, for debugging
}

// Cache for resolved "via" paths to avoid repeated DB lookups
const viaCache = new Map<string, string | null>();

// =============================================================================
// Core Authorization Functions
// =============================================================================

/**
 * Check if a user has a specific capability on a resource.
 *
 * @param userId - The Steam ID of the user
 * @param capability - The capability to check (e.g., "team:edit")
 * @param resource - The resource being accessed
 * @returns Whether the user has the capability
 *
 * @example
 * ```ts
 * if (await can(user.steamId, 'team:edit', { type: 'team', id: teamId })) {
 *   // User can edit the team
 * }
 * ```
 */
export async function can(
	userId: string,
	capability: string,
	resource: ResourceRef
): Promise<boolean> {
	const result = await check(userId, capability, resource);
	return result.allowed;
}

/**
 * Check if a user has a capability, with detailed result info.
 * Useful for debugging or audit logging.
 */
export async function check(
	userId: string,
	capability: string,
	resource: ResourceRef
): Promise<CheckResult> {
	const cap = capabilities[capability];
	if (!cap) {
		console.warn(`Unknown capability: ${capability}`);
		return { allowed: false, reason: `Unknown capability: ${capability}` };
	}

	// Check each possible path
	for (const path of cap.paths) {
		const pathStr = JSON.stringify(path);

		try {
			if (await checkPath(userId, path, resource)) {
				return { allowed: true, path: pathStr };
			}
		} catch (error) {
			console.error(`Error checking path ${pathStr}:`, error);
			// Continue to next path
		}
	}

	return { allowed: false, reason: 'No matching grant path' };
}

/**
 * Assert that a user has a capability. Throws if not.
 *
 * @throws {AuthorizationError} If the user doesn't have the capability
 *
 * @example
 * ```ts
 * await require(user.steamId, 'team:edit', { type: 'team', id: teamId });
 * // If we get here, the user is authorized
 * ```
 */
export async function require(
	userId: string,
	capability: string,
	resource: ResourceRef
): Promise<void> {
	const result = await check(userId, capability, resource);
	if (!result.allowed) {
		const { forbidden } = await import('../utils/errors');
		forbidden(`Permission denied: ${capability} on ${resource.type}:${resource.id}`);
	}
}

// =============================================================================
// Path Checking
// =============================================================================

/**
 * Check if a single path grants access.
 * A path is a sequence of relationship checks, all of which must pass.
 */
async function checkPath(
	userId: string,
	path: Array<{ relation: string; on?: { type: string; id?: string; via?: string } }>,
	resource: ResourceRef
): Promise<boolean> {
	for (const step of path) {
		let targetType = resource.type;
		let targetId = String(resource.id);

		// If this step requires checking a different object
		if (step.on) {
			targetType = step.on.type;

			if (step.on.id) {
				// Static ID (e.g., "*" for wildcards)
				targetId = step.on.id;
			} else if (step.on.via) {
				// Resolve the ID by following a path (e.g., "team.divisionId")
				const resolved = await resolveVia(resource, step.on.via);
				if (!resolved) return false;
				targetId = resolved;
			}
		}

		// Check if the user has this grant (directly or via role)
		const hasGrant = await checkGrant(userId, step.relation, targetType, targetId);
		if (!hasGrant) return false;
	}

	return true;
}

/**
 * Check if a user has a specific grant.
 * Checks both direct grants and role-inherited grants.
 */
async function checkGrant(
	userId: string,
	relation: string,
	objectType: string,
	objectId: string
): Promise<boolean> {
	const now = new Date();

	// Check direct grant from user
	const direct = await prisma.grant.findFirst({
		where: {
			subjectType: 'user',
			subjectId: userId,
			relation,
			objectType,
			objectId: { in: [objectId, '*'] }, // Exact match or wildcard
			OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
		}
	});

	if (direct) return true;

	// Check role-based grants: user -> member -> role -> grant
	const userRoles = await prisma.grant.findMany({
		where: {
			subjectType: 'user',
			subjectId: userId,
			relation: 'member',
			objectType: 'role',
			OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
		}
	});

	for (const roleGrant of userRoles) {
		const roleHasGrant = await prisma.grant.findFirst({
			where: {
				subjectType: 'role',
				subjectId: roleGrant.objectId,
				relation,
				objectType,
				objectId: { in: [objectId, '*'] },
				OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
			}
		});
		if (roleHasGrant) return true;
	}

	return false;
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve a "via" path like "team.divisionId" or "match.homeTeam.divisionId"
 * to get the actual ID of the target object.
 */
async function resolveVia(resource: ResourceRef, via: string): Promise<string | null> {
	const cacheKey = `${resource.type}:${resource.id}:${via}`;

	if (viaCache.has(cacheKey)) {
		return viaCache.get(cacheKey)!;
	}

	const parts = via.split('.');
	const [model, ...fields] = parts;

	// The model should match the resource type
	if (model !== resource.type) {
		console.warn(`Via path model "${model}" doesn't match resource type "${resource.type}"`);
		return null;
	}

	try {
		// Build the select object for nested fields
		const select = buildNestedSelect(fields);

		// Fetch the resource
		const record = await (prisma as Record<string, unknown>)[model as string];
		if (!record || typeof record !== 'object' || !('findUnique' in record)) {
			return null;
		}

		const result = await (record as { findUnique: Function }).findUnique({
			where: { id: Number(resource.id) },
			select
		});

		if (!result) return null;

		// Traverse the result to get the final value
		let value: unknown = result;
		for (const field of fields) {
			if (value && typeof value === 'object' && field in value) {
				value = (value as Record<string, unknown>)[field];
			} else {
				return null;
			}
		}

		const resolved = value !== null && value !== undefined ? String(value) : null;
		viaCache.set(cacheKey, resolved);
		return resolved;
	} catch (error) {
		console.error(`Error resolving via path "${via}":`, error);
		return null;
	}
}

/**
 * Build a nested select object for Prisma.
 * e.g., ["homeTeam", "divisionId"] -> { homeTeam: { select: { divisionId: true } } }
 */
function buildNestedSelect(fields: string[]): Record<string, unknown> {
	if (fields.length === 0) return {};
	if (fields.length === 1) return { [fields[0]]: true };

	const [first, ...rest] = fields;
	return {
		[first]: {
			select: buildNestedSelect(rest)
		}
	};
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Clear the via resolution cache.
 * Call this after data changes that might affect path resolution.
 */
export function clearCache(): void {
	viaCache.clear();
}

/**
 * Clear cache entries for a specific resource.
 */
export function clearCacheFor(resourceType: string, resourceId: string | number): void {
	const prefix = `${resourceType}:${resourceId}:`;
	for (const key of viaCache.keys()) {
		if (key.startsWith(prefix)) {
			viaCache.delete(key);
		}
	}
}

