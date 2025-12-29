/**
 * Capability Definitions for ReBAC Authorization
 *
 * This file defines all capabilities (permissions) in the system and
 * the relationship paths that can grant them.
 *
 * Each capability has one or more "paths" - ways to derive the permission.
 * A path is a sequence of relationship checks. If ANY path succeeds, access is granted.
 *
 * Path step structure:
 * - { relation: "owner" } - Check for this relation on the resource
 * - { relation: "moderator", on: { type: "division", via: "team.divisionId" } }
 *   - Check for "moderator" relation on a different object
 *   - The object is resolved by following "team.divisionId" from the resource
 * - { relation: "admin", on: { type: "global", id: "*" } }
 *   - Check for "admin" relation on a static object (global:*)
 *
 * @module capabilities
 */

// =============================================================================
// Types
// =============================================================================

export interface ResourceRef {
	type: string;
	id: string | number;
}

export interface PathStep {
	relation: string;
	on?: {
		type: string;
		id?: string; // Static ID (e.g., "*")
		via?: string; // Path to resolve ID (e.g., "team.divisionId")
	};
}

export interface Capability {
	description: string;
	paths: PathStep[][];
}

// =============================================================================
// Capability Definitions
// =============================================================================

export const capabilities: Record<string, Capability> = {
	// ===========================================================================
	// Team Capabilities
	// ===========================================================================

	'team:view': {
		description: 'View team details (public teams are viewable by all)',
		paths: [
			// Anyone can view teams (handled separately for now)
			// This is here for completeness if we add private teams
			[{ relation: 'member' }],
			[{ relation: 'admin' }],
			[{ relation: 'owner' }],
			[{ relation: 'moderator', on: { type: 'division', via: 'team.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'team:edit': {
		description: 'Edit team name, avatar, and settings',
		paths: [
			// Direct team ownership/admin
			[{ relation: 'owner' }],
			[{ relation: 'admin' }],
			// Division moderator
			[{ relation: 'moderator', on: { type: 'division', via: 'team.divisionId' } }],
			// Region admin
			[{ relation: 'admin', on: { type: 'region', via: 'team.regionId' } }],
			// Global admin
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'team:manage_roster': {
		description: 'Add/remove players, promote/demote within team',
		paths: [
			[{ relation: 'owner' }],
			[{ relation: 'admin' }],
			[{ relation: 'moderator', on: { type: 'division', via: 'team.divisionId' } }],
			[{ relation: 'admin', on: { type: 'region', via: 'team.regionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'team:approve_players': {
		description: 'Approve or deny pending player requests',
		paths: [
			[{ relation: 'owner' }],
			[{ relation: 'admin' }],
			[{ relation: 'moderator', on: { type: 'division', via: 'team.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'team:delete': {
		description: 'Delete/disband a team',
		paths: [
			[{ relation: 'owner' }],
			[{ relation: 'admin', on: { type: 'region', via: 'team.regionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'team:transfer_ownership': {
		description: 'Transfer team ownership to another player',
		paths: [
			[{ relation: 'owner' }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Match Capabilities
	// ===========================================================================

	'match:view': {
		description: 'View match details',
		paths: [
			// Team participants
			[{ relation: 'owner', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'member', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'owner', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'member', on: { type: 'team', via: 'match.awayTeamId' } }],
			// Staff
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'match:submit_score': {
		description: 'Submit or update match scores',
		paths: [
			// Team owners only (not regular members)
			[{ relation: 'owner', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'owner', on: { type: 'team', via: 'match.awayTeamId' } }],
			// Staff can submit on behalf
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'match:dispute': {
		description: 'File or manage a dispute for a match',
		paths: [
			[{ relation: 'owner', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'owner', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'match:resolve_dispute': {
		description: 'Resolve a disputed match',
		paths: [
			// Only staff can resolve disputes
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'match:reschedule': {
		description: 'Request or approve match reschedule',
		paths: [
			[{ relation: 'owner', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'owner', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'match:post_comm': {
		description: 'Post in match communications',
		paths: [
			// All team members can post
			[{ relation: 'owner', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'admin', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'member', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'owner', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'admin', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'member', on: { type: 'team', via: 'match.awayTeamId' } }],
			// Staff
			[{ relation: 'moderator', on: { type: 'division', via: 'match.homeTeam.divisionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Division Capabilities
	// ===========================================================================

	'division:view': {
		description: 'View division details and standings',
		paths: [
			// Public - everyone can view (handled separately)
			[{ relation: 'viewer' }],
			[{ relation: 'moderator' }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'division:moderate': {
		description: 'Moderate division (manage teams, matches)',
		paths: [[{ relation: 'moderator' }], [{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'division:edit': {
		description: 'Edit division settings',
		paths: [
			[{ relation: 'admin', on: { type: 'region', via: 'division.regionId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Region Capabilities
	// ===========================================================================

	'region:view': {
		description: 'View region details',
		paths: [[{ relation: 'viewer' }], [{ relation: 'admin' }], [{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'region:admin': {
		description: 'Administer region (manage divisions, seasons)',
		paths: [[{ relation: 'admin' }], [{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	// ===========================================================================
	// Admin Panel Capabilities
	// ===========================================================================

	'admin:access': {
		description: 'Access the admin panel',
		paths: [
			// Any division moderator
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			// Any region admin
			[{ relation: 'admin', on: { type: 'region', id: '*' } }],
			// Global admin
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:manage_users': {
		description: 'View and manage user accounts',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:ban_users': {
		description: 'Ban or suspend users',
		paths: [
			// Only global admins can ban
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:manage_teams': {
		description: 'View and manage all teams',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:manage_matches': {
		description: 'View and manage all matches',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:create_matches': {
		description: 'Create new matches',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:manage_demos': {
		description: 'Review and manage demo reports',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:manage_disputes': {
		description: 'View and resolve disputes',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'admin:pending_players': {
		description: 'View and manage pending player requests',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Site Administration (Strict - Global Admin Only)
	// ===========================================================================

	'site:edit_settings': {
		description: 'Edit site title, favicon, and global settings',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:edit_content': {
		description: 'Edit site content (rulebook, homepage, etc.)',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:manage_seasons': {
		description: 'Create and manage seasons',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:manage_regions': {
		description: 'Create and manage regions',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:manage_divisions': {
		description: 'Create and manage divisions',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:manage_arenas': {
		description: 'Create and manage arenas/maps',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'site:global_settings': {
		description: 'Edit global league settings (fees, roster lock, etc.)',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	// ===========================================================================
	// Grant Management (Meta-permissions)
	// ===========================================================================

	'grants:view': {
		description: 'View grants for a resource',
		paths: [
			[{ relation: 'owner' }],
			[{ relation: 'admin' }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'grants:manage': {
		description: 'Create, update, or revoke grants',
		paths: [
			// Only global admins can manage grants directly
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Demo/Recording Capabilities
	// ===========================================================================

	'demo:submit': {
		description: 'Submit a demo recording',
		paths: [
			// Team members can submit for their matches
			[{ relation: 'member', on: { type: 'team', via: 'match.homeTeamId' } }],
			[{ relation: 'member', on: { type: 'team', via: 'match.awayTeamId' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'demo:report': {
		description: 'Report a demo for review',
		paths: [
			// Anyone authenticated can report (handled at auth level)
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'demo:review': {
		description: 'Review demo reports and take action',
		paths: [
			[{ relation: 'moderator', on: { type: 'division', id: '*' } }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Tournament Capabilities
	// ===========================================================================

	'tournament:create': {
		description: 'Create a new tournament',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'tournament:edit': {
		description: 'Edit tournament details',
		paths: [
			[{ relation: 'admin' }], // Tournament admin
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	'tournament:manage_bracket': {
		description: 'Manage tournament bracket and results',
		paths: [
			[{ relation: 'admin' }],
			[{ relation: 'moderator' }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	},

	// ===========================================================================
	// Championship Capabilities
	// ===========================================================================

	'championship:create': {
		description: 'Create a new championship',
		paths: [[{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'championship:edit': {
		description: 'Edit championship details',
		paths: [[{ relation: 'admin' }], [{ relation: 'admin', on: { type: 'global', id: '*' } }]]
	},

	'championship:manage': {
		description: 'Manage championship matches and participants',
		paths: [
			[{ relation: 'admin' }],
			[{ relation: 'moderator' }],
			[{ relation: 'admin', on: { type: 'global', id: '*' } }]
		]
	}
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all capabilities that match a prefix.
 * Useful for UI display of permission groups.
 */
export function getCapabilitiesByPrefix(prefix: string): Record<string, Capability> {
	const result: Record<string, Capability> = {};
	for (const [key, value] of Object.entries(capabilities)) {
		if (key.startsWith(prefix)) {
			result[key] = value;
		}
	}
	return result;
}

/**
 * Get all capability names.
 */
export function getAllCapabilityNames(): string[] {
	return Object.keys(capabilities);
}

/**
 * Check if a capability exists.
 */
export function hasCapability(name: string): boolean {
	return name in capabilities;
}

