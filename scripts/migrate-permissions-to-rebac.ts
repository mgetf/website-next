/**
 * Migration Script: Convert Legacy Permissions to ReBAC Grants
 *
 * This script migrates existing permission data to the new grants table:
 *
 * 1. User.permissionLevel = ADMIN -> (user, admin, global, *)
 * 2. User.permissionLevel = MODERATOR + Moderator.divisionId -> (user, moderator, division, X)
 * 3. User.permissionLevel = MODERATOR (no division) -> (user, moderator, division, *)
 * 4. PlayerInTeam.permissionLevel = 2 (owner) -> (user, owner, team, X)
 * 5. PlayerInTeam.permissionLevel = 1 (admin) -> (user, admin, team, X)
 * 6. PlayerInTeam.permissionLevel = 0 (member) -> (user, member, team, X)
 *
 * Run with: npx tsx scripts/migrate-permissions-to-rebac.ts
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --verbose    Show detailed output
 */

import { PrismaClient, UserRole } from '../prisma/generated/index.js';

const prisma = new PrismaClient();

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

interface MigrationStats {
	globalAdmins: number;
	divisionModerators: number;
	wildcardModerators: number;
	teamOwners: number;
	teamAdmins: number;
	teamMembers: number;
	errors: string[];
}

const stats: MigrationStats = {
	globalAdmins: 0,
	divisionModerators: 0,
	wildcardModerators: 0,
	teamOwners: 0,
	teamAdmins: 0,
	teamMembers: 0,
	errors: []
};

function log(message: string) {
	console.log(message);
}

function verbose(message: string) {
	if (VERBOSE) {
		console.log(`  ${message}`);
	}
}

async function createGrant(data: {
	subjectType: string;
	subjectId: string;
	relation: string;
	objectType: string;
	objectId: string;
	note?: string;
}) {
	if (DRY_RUN) {
		verbose(
			`[DRY RUN] Would create: (${data.subjectType}:${data.subjectId}, ${data.relation}, ${data.objectType}:${data.objectId})`
		);
		return;
	}

	try {
		await prisma.grant.upsert({
			where: {
				subjectType_subjectId_relation_objectType_objectId: {
					subjectType: data.subjectType,
					subjectId: data.subjectId,
					relation: data.relation,
					objectType: data.objectType,
					objectId: data.objectId
				}
			},
			create: {
				subjectType: data.subjectType,
				subjectId: data.subjectId,
				relation: data.relation,
				objectType: data.objectType,
				objectId: data.objectId,
				note: data.note || 'Migrated from legacy permissions'
			},
			update: {} // No update needed if exists
		});
		verbose(
			`Created: (${data.subjectType}:${data.subjectId}, ${data.relation}, ${data.objectType}:${data.objectId})`
		);
	} catch (error) {
		const message = `Failed to create grant for ${data.subjectId}: ${error}`;
		stats.errors.push(message);
		console.error(message);
	}
}

async function migrateGlobalAdmins() {
	log('\n📋 Migrating Global Admins (User.permissionLevel = ADMIN)...');

	const admins = await prisma.user.findMany({
		where: { permissionLevel: UserRole.ADMIN },
		select: { steamId: true, steamUsername: true }
	});

	log(`Found ${admins.length} global admins`);

	for (const admin of admins) {
		await createGrant({
			subjectType: 'user',
			subjectId: admin.steamId,
			relation: 'admin',
			objectType: 'global',
			objectId: '*',
			note: `Migrated: was ADMIN (${admin.steamUsername})`
		});
		stats.globalAdmins++;
	}
}

async function migrateModerators() {
	log('\n📋 Migrating Moderators (User.permissionLevel = MODERATOR)...');

	const moderators = await prisma.user.findMany({
		where: { permissionLevel: UserRole.MODERATOR },
		select: {
			steamId: true,
			steamUsername: true,
			moderator: {
				select: {
					divisionId: true,
					staffType: true
				}
			}
		}
	});

	log(`Found ${moderators.length} moderators`);

	for (const mod of moderators) {
		if (mod.moderator?.divisionId) {
			// Has specific division assignment
			await createGrant({
				subjectType: 'user',
				subjectId: mod.steamId,
				relation: 'moderator',
				objectType: 'division',
				objectId: String(mod.moderator.divisionId),
				note: `Migrated: was MODERATOR for division ${mod.moderator.divisionId} (${mod.steamUsername})`
			});
			stats.divisionModerators++;
		} else {
			// No specific division - give wildcard access
			await createGrant({
				subjectType: 'user',
				subjectId: mod.steamId,
				relation: 'moderator',
				objectType: 'division',
				objectId: '*',
				note: `Migrated: was MODERATOR with no division (${mod.steamUsername})`
			});
			stats.wildcardModerators++;
		}
	}
}

async function migrateTeamMemberships() {
	log('\n📋 Migrating Team Memberships (PlayerInTeam)...');

	const memberships = await prisma.playerInTeam.findMany({
		where: {
			active: 1 // Only active memberships
		},
		select: {
			playerSteamId: true,
			teamId: true,
			permissionLevel: true,
			player: {
				select: { steamUsername: true }
			}
		}
	});

	log(`Found ${memberships.length} active team memberships`);

	for (const membership of memberships) {
		const username = membership.player?.steamUsername || 'Unknown';
		let relation: string;
		let statKey: keyof MigrationStats;

		switch (membership.permissionLevel) {
			case 2: // Owner
				relation = 'owner';
				statKey = 'teamOwners';
				break;
			case 1: // Admin
				relation = 'admin';
				statKey = 'teamAdmins';
				break;
			case 0: // Member
			default:
				relation = 'member';
				statKey = 'teamMembers';
				break;
		}

		await createGrant({
			subjectType: 'user',
			subjectId: membership.playerSteamId,
			relation,
			objectType: 'team',
			objectId: String(membership.teamId),
			note: `Migrated: was ${relation} of team ${membership.teamId} (${username})`
		});

		(stats[statKey] as number)++;
	}
}

async function createDefaultRoles() {
	log('\n📋 Creating Default Roles...');

	if (DRY_RUN) {
		verbose('[DRY RUN] Would create default roles');
		return;
	}

	// Create a "staff" role that has moderator access to all divisions
	// This is useful for cross-division staff
	await createGrant({
		subjectType: 'role',
		subjectId: 'staff',
		relation: 'moderator',
		objectType: 'division',
		objectId: '*',
		note: 'Default role: Staff members can moderate all divisions'
	});

	// Create a "caster" role that can view matches (for future use)
	await createGrant({
		subjectType: 'role',
		subjectId: 'caster',
		relation: 'viewer',
		objectType: 'match',
		objectId: '*',
		note: 'Default role: Casters can view all matches'
	});

	log('Created default roles: staff, caster');
}

async function printSummary() {
	log('\n' + '='.repeat(60));
	log('MIGRATION SUMMARY');
	log('='.repeat(60));

	if (DRY_RUN) {
		log('🔍 DRY RUN - No changes were made\n');
	}

	log(`Global Admins:        ${stats.globalAdmins}`);
	log(`Division Moderators:  ${stats.divisionModerators}`);
	log(`Wildcard Moderators:  ${stats.wildcardModerators}`);
	log(`Team Owners:          ${stats.teamOwners}`);
	log(`Team Admins:          ${stats.teamAdmins}`);
	log(`Team Members:         ${stats.teamMembers}`);
	log('-'.repeat(60));
	log(
		`TOTAL GRANTS:         ${stats.globalAdmins + stats.divisionModerators + stats.wildcardModerators + stats.teamOwners + stats.teamAdmins + stats.teamMembers}`
	);

	if (stats.errors.length > 0) {
		log(`\n⚠️  ERRORS: ${stats.errors.length}`);
		for (const error of stats.errors) {
			log(`  - ${error}`);
		}
	}

	log('\n' + '='.repeat(60));
}

async function verifyMigration() {
	if (DRY_RUN) return;

	log('\n🔍 Verifying migration...');

	const grantCount = await prisma.grant.count();
	log(`Total grants in database: ${grantCount}`);

	// Sample some grants
	const sampleGrants = await prisma.grant.findMany({
		take: 5,
		orderBy: { grantedAt: 'desc' }
	});

	if (sampleGrants.length > 0) {
		log('\nSample grants:');
		for (const grant of sampleGrants) {
			log(
				`  (${grant.subjectType}:${grant.subjectId.slice(0, 10)}..., ${grant.relation}, ${grant.objectType}:${grant.objectId})`
			);
		}
	}
}

async function main() {
	log('='.repeat(60));
	log('ReBAC Permission Migration');
	log('='.repeat(60));

	if (DRY_RUN) {
		log('🔍 DRY RUN MODE - No changes will be made');
	}

	try {
		await migrateGlobalAdmins();
		await migrateModerators();
		await migrateTeamMemberships();
		await createDefaultRoles();
		await verifyMigration();
		await printSummary();

		if (!DRY_RUN) {
			log('\n✅ Migration completed successfully!');
			log('\nNext steps:');
			log('1. Test the application to ensure permissions work correctly');
			log('2. Update routes to use new can() / require() functions');
			log('3. Eventually remove legacy User.permissionLevel and Moderator table');
		}
	} catch (error) {
		console.error('\n❌ Migration failed:', error);
		process.exit(1);
	} finally {
		await prisma.$disconnect();
	}
}

main();

