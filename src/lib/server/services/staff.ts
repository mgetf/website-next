/**
 * Staff hub: site role + league assignments are the source of truth.
 * SourceBans and Discord are derived from configurable mappings.
 */

import { prisma } from '$lib/server/db';
import { UserRole, type StaffSyncStatus } from '$prisma/client.js';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { invalidateCachedSessionVersion } from '$lib/server/auth/sessionCache';
import {
  mapStaffAssignmentForDisplay,
  replaceStaffAssignments,
  staffAssignmentInclude,
  type StaffAssignmentPair,
} from './staffAssignments';
import {
  deactivateSourcebansAdmin,
  isSourcebansConfigured,
  upsertSourcebansAdmin,
  SourcebansError,
} from './sourcebans';
import {
  DiscordGuildError,
  filterOrphanManagedRoleHolders,
  isDiscordGuildConfigured,
  listDiscordGuildMembers,
  listDiscordGuildRoles,
  syncDiscordMemberRoles,
} from './discordGuild';
import type {
  OrphanManagedDiscordAudit,
  StaffAssignmentDisplay,
  StaffSyncStatusDisplay,
} from '$lib/types/staff';

export const STAFF_ROLES = [UserRole.MODERATOR, UserRole.ADMIN] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type AssignmentScope = {
  formatId: number;
  regionId: number;
};

export type StaffMappingSnapshot = {
  roleMappings: Array<{
    permissionLevel: StaffRole;
    sourcebansServerGroupId: number | null;
    sourcebansWebGroupId: number | null;
    sourcebansImmunity: number;
    discordRoleIds: string[];
  }>;
  discordRules: Array<{
    id?: number;
    permissionLevel: UserRole | null;
    formatId: number | null;
    regionId: number | null;
    discordRoleId: string;
  }>;
  sourcebansServers: Array<{
    regionId: number;
    sourcebansServerId: number;
  }>;
};

export type SourcebansResolvedPayload = {
  serverGroupId: number | null;
  webGroupId: number | null;
  immunity: number;
  serverIds: number[] | null;
};

export type StaffIntegrations = {
  sourcebans: {
    configured: boolean;
    upsertAdmin: typeof upsertSourcebansAdmin;
    deactivateAdmin: typeof deactivateSourcebansAdmin;
  };
  discord: {
    configured: boolean;
    syncMemberRoles: typeof syncDiscordMemberRoles;
  };
};

export const LAST_ADMIN_MESSAGE = 'Cannot demote or downgrade the last admin.';
export const STAFF_PUNISH_BLOCKED_MESSAGE =
  'Demote this user from /admin/staff before punishing them.';
export const ORPHAN_IS_STAFF_MESSAGE =
  'That Discord account belongs to designated staff. Demote them from this page instead.';

export function isStaffRole(value: string): value is StaffRole {
  return value === UserRole.MODERATOR || value === UserRole.ADMIN;
}

export function wouldRemoveLastAdmin(
  currentRole: string,
  nextRole: string,
  adminCount: number,
): boolean {
  return currentRole === UserRole.ADMIN && nextRole !== UserRole.ADMIN && adminCount <= 1;
}

export type StaffSyncResult = {
  sourcebansStatus: StaffSyncStatus;
  sourcebansError: string | null;
  discordStatus: StaffSyncStatus;
  discordError: string | null;
};

export type StaffResyncCounts = {
  total: number;
  ok: number;
  error: number;
  pending: number;
};

export function classifyStaffSyncResult(result: StaffSyncResult): 'ok' | 'error' | 'pending' {
  if (result.sourcebansStatus === 'ERROR' || result.discordStatus === 'ERROR') return 'error';
  if (result.sourcebansStatus === 'PENDING' || result.discordStatus === 'PENDING') return 'pending';
  return 'ok';
}

function formatSyncArm(status: StaffSyncStatus, error: string | null): string {
  const label = status.toLowerCase();
  if (error && status !== 'OK') return `${label}: ${error}`;
  return label;
}

export function formatStaffSyncMessage(result: StaffSyncResult): string {
  return `SB ${formatSyncArm(result.sourcebansStatus, result.sourcebansError)} · DC ${formatSyncArm(result.discordStatus, result.discordError)}`;
}

export function formatStaffResyncSummary(counts: StaffResyncCounts): string {
  return `Resynced ${counts.total} staff: ${counts.ok} ok, ${counts.pending} pending, ${counts.error} error`;
}

export function formatOrphanDiscordStripSummary(stripped: number, failed: number): string {
  if (failed > 0) {
    return `Removed hub Discord roles from ${stripped} member${stripped === 1 ? '' : 's'}, ${failed} failed`;
  }
  return `Removed hub Discord roles from ${stripped} member${stripped === 1 ? '' : 's'}`;
}

const staffSyncLocks = new Map<string, Promise<unknown>>();

export async function withStaffSyncLock<T>(steamId: string, work: () => Promise<T>): Promise<T> {
  const previous = staffSyncLocks.get(steamId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(work);
  staffSyncLocks.set(steamId, next);
  try {
    return await next;
  } finally {
    if (staffSyncLocks.get(steamId) === next) {
      staffSyncLocks.delete(steamId);
    }
  }
}

export function resolveDiscordRoleIds(
  permissionLevel: StaffRole,
  assignments: AssignmentScope[],
  snapshot: StaffMappingSnapshot,
): string[] {
  const roles = new Set<string>();
  const mapping = snapshot.roleMappings.find((row) => row.permissionLevel === permissionLevel);
  if (mapping) {
    for (const roleId of mapping.discordRoleIds) {
      if (roleId) roles.add(roleId);
    }
  }

  for (const rule of snapshot.discordRules) {
    if (rule.permissionLevel && rule.permissionLevel !== permissionLevel) continue;
    const scoped = rule.formatId != null || rule.regionId != null;
    if (scoped) {
      const matches = assignments.some(
        (assignment) =>
          (rule.formatId == null || assignment.formatId === rule.formatId) &&
          (rule.regionId == null || assignment.regionId === rule.regionId),
      );
      if (!matches) continue;
    }
    if (rule.discordRoleId) roles.add(rule.discordRoleId);
  }

  return [...roles];
}

export function catalogDiscordRoleIds(snapshot: StaffMappingSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const mapping of snapshot.roleMappings) {
    for (const roleId of mapping.discordRoleIds) {
      if (roleId) ids.add(roleId);
    }
  }
  for (const rule of snapshot.discordRules) {
    if (rule.discordRoleId) ids.add(rule.discordRoleId);
  }
  return ids;
}

export function resolveSourcebansPayload(
  permissionLevel: StaffRole,
  assignments: AssignmentScope[],
  snapshot: StaffMappingSnapshot,
): SourcebansResolvedPayload {
  const mapping = snapshot.roleMappings.find((row) => row.permissionLevel === permissionLevel);
  const regionIds = new Set(assignments.map((assignment) => assignment.regionId));
  const matchedServers = [
    ...new Set(
      snapshot.sourcebansServers
        .filter((row) => regionIds.has(row.regionId))
        .map((row) => row.sourcebansServerId),
    ),
  ];

  const omitServers = assignments.length === 0 || snapshot.sourcebansServers.length === 0;

  return {
    serverGroupId: mapping?.sourcebansServerGroupId ?? null,
    webGroupId: mapping?.sourcebansWebGroupId ?? null,
    immunity: mapping?.sourcebansImmunity ?? 0,
    serverIds: omitServers ? null : matchedServers,
  };
}

function defaultIntegrations(): StaffIntegrations {
  return {
    sourcebans: {
      configured: isSourcebansConfigured(),
      upsertAdmin: upsertSourcebansAdmin,
      deactivateAdmin: deactivateSourcebansAdmin,
    },
    discord: {
      configured: isDiscordGuildConfigured(),
      syncMemberRoles: syncDiscordMemberRoles,
    },
  };
}

function clipError(message: string): string {
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

async function loadMappingSnapshot(): Promise<StaffMappingSnapshot> {
  const [roleMappings, discordRules, sourcebansServers] = await Promise.all([
    prisma.staffRoleMapping.findMany(),
    prisma.staffDiscordRule.findMany(),
    prisma.staffSourcebansServer.findMany(),
  ]);

  return {
    roleMappings: roleMappings
      .filter((row): row is typeof row & { permissionLevel: StaffRole } =>
        isStaffRole(row.permissionLevel),
      )
      .map((row) => ({
        permissionLevel: row.permissionLevel,
        sourcebansServerGroupId: row.sourcebansServerGroupId,
        sourcebansWebGroupId: row.sourcebansWebGroupId,
        sourcebansImmunity: row.sourcebansImmunity,
        discordRoleIds: row.discordRoleIds,
      })),
    discordRules: discordRules.map((row) => ({
      id: row.id,
      permissionLevel: row.permissionLevel,
      formatId: row.formatId,
      regionId: row.regionId,
      discordRoleId: row.discordRoleId,
    })),
    sourcebansServers: sourcebansServers.map((row) => ({
      regionId: row.regionId,
      sourcebansServerId: row.sourcebansServerId,
    })),
  };
}

function scopesFromAssignments(
  assignments: Array<{ formatId: number; division: { regionId: number } }>,
): AssignmentScope[] {
  return assignments.map((assignment) => ({
    formatId: assignment.formatId,
    regionId: assignment.division.regionId,
  }));
}

async function upsertSyncState(
  steamId: string,
  data: {
    sourcebansAdminId?: number | null;
    sourcebansStatus: StaffSyncStatus;
    sourcebansError: string | null;
    discordStatus: StaffSyncStatus;
    discordError: string | null;
  },
) {
  await prisma.staffSyncState.upsert({
    where: { steamId },
    create: {
      steamId,
      sourcebansAdminId: data.sourcebansAdminId ?? null,
      sourcebansStatus: data.sourcebansStatus,
      sourcebansError: data.sourcebansError,
      discordStatus: data.discordStatus,
      discordError: data.discordError,
      lastSyncedAt: new Date(),
    },
    update: {
      ...(data.sourcebansAdminId !== undefined
        ? { sourcebansAdminId: data.sourcebansAdminId }
        : {}),
      sourcebansStatus: data.sourcebansStatus,
      sourcebansError: data.sourcebansError,
      discordStatus: data.discordStatus,
      discordError: data.discordError,
      lastSyncedAt: new Date(),
    },
  });
}

export async function syncSourcebansForStaff(
  steamId: string,
  steamUsername: string,
  permissionLevel: StaffRole,
  scopes: AssignmentScope[],
  snapshot: StaffMappingSnapshot,
  integrations: StaffIntegrations,
): Promise<{ status: StaffSyncStatus; error: string | null; adminId: number | null }> {
  if (!integrations.sourcebans.configured) {
    return { status: 'SKIPPED', error: 'SourceBans is not configured', adminId: null };
  }

  const payload = resolveSourcebansPayload(permissionLevel, scopes, snapshot);
  if (payload.serverGroupId == null && payload.webGroupId == null) {
    return {
      status: 'SKIPPED',
      error: `No SourceBans group mapped for ${permissionLevel}`,
      adminId: null,
    };
  }

  try {
    const body: Parameters<StaffIntegrations['sourcebans']['upsertAdmin']>[1] = {
      name: steamUsername,
      immunity: payload.immunity,
    };
    if (payload.serverGroupId != null) body.server_group_id = payload.serverGroupId;
    if (payload.webGroupId != null) {
      body.web_group_id = payload.webGroupId;
      body.email = `${steamId}@noreply.mge.tf`;
    }
    if (payload.serverIds != null) body.server_ids = payload.serverIds;

    const admin = await integrations.sourcebans.upsertAdmin(steamId, body);
    return { status: 'OK', error: null, adminId: admin.id };
  } catch (err) {
    const message = err instanceof SourcebansError ? err.message : 'SourceBans sync failed';
    return { status: 'ERROR', error: clipError(message), adminId: null };
  }
}

export async function syncDiscordForStaff(
  discordId: string | null,
  permissionLevel: StaffRole | null,
  scopes: AssignmentScope[],
  snapshot: StaffMappingSnapshot,
  integrations: StaffIntegrations,
): Promise<{ status: StaffSyncStatus; error: string | null }> {
  if (!integrations.discord.configured) {
    return { status: 'SKIPPED', error: 'Discord bot is not configured' };
  }
  if (!discordId) {
    return { status: 'PENDING', error: 'Discord is not linked' };
  }

  const desired =
    permissionLevel == null ? [] : resolveDiscordRoleIds(permissionLevel, scopes, snapshot);
  const managed = catalogDiscordRoleIds(snapshot);

  try {
    const result = await integrations.discord.syncMemberRoles(discordId, desired, managed);
    if (result === 'not_in_guild') {
      return { status: 'PENDING', error: 'Not in the Discord server' };
    }
    return { status: 'OK', error: null };
  } catch (err) {
    const message = err instanceof DiscordGuildError ? err.message : 'Discord sync failed';
    return { status: 'ERROR', error: clipError(message) };
  }
}

async function assertNotLastAdmin(steamId: string, nextRole: string) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { permissionLevel: true },
  });
  if (!user) notFound('User not found');
  if (user.permissionLevel !== UserRole.ADMIN || nextRole === UserRole.ADMIN) return;
  const adminCount = await prisma.user.count({ where: { permissionLevel: UserRole.ADMIN } });
  if (wouldRemoveLastAdmin(user.permissionLevel, nextRole, adminCount)) {
    badRequest(LAST_ADMIN_MESSAGE);
  }
}

async function syncStaffUserUnlocked(
  steamId: string,
  mode: 'designate' | 'demote',
  integrations: StaffIntegrations,
) {
  const user = await prisma.user.findUnique({
    where: { steamId },
    include: {
      discord: true,
      staffAssignments: { include: { division: { select: { regionId: true } } } },
    },
  });
  if (!user) notFound('User not found');

  const snapshot = await loadMappingSnapshot();
  const scopes = scopesFromAssignments(user.staffAssignments);
  const isStaff = isStaffRole(user.permissionLevel);

  let sourcebansStatus: StaffSyncStatus = 'SKIPPED';
  let sourcebansError: string | null = null;
  let sourcebansAdminId: number | null | undefined;
  let discordStatus: StaffSyncStatus = 'SKIPPED';
  let discordError: string | null = null;

  if (mode === 'demote' || !isStaff) {
    if (integrations.sourcebans.configured) {
      try {
        await integrations.sourcebans.deactivateAdmin(steamId, 'Demoted from mge.tf staff hub');
        sourcebansStatus = 'OK';
        sourcebansError = null;
      } catch (err) {
        sourcebansStatus = 'ERROR';
        sourcebansError = clipError(
          err instanceof SourcebansError ? err.message : 'SourceBans deactivate failed',
        );
      }
    } else {
      sourcebansStatus = 'SKIPPED';
      sourcebansError = 'SourceBans is not configured';
    }

    const discordResult = await syncDiscordForStaff(
      user.discord?.discordId ?? null,
      null,
      [],
      snapshot,
      integrations,
    );
    discordStatus = discordResult.status;
    discordError = discordResult.error;
  } else if (isStaffRole(user.permissionLevel)) {
    const sb = await syncSourcebansForStaff(
      steamId,
      user.steamUsername,
      user.permissionLevel,
      scopes,
      snapshot,
      integrations,
    );
    sourcebansStatus = sb.status;
    sourcebansError = sb.error;
    sourcebansAdminId = sb.adminId;

    const discordResult = await syncDiscordForStaff(
      user.discord?.discordId ?? null,
      user.permissionLevel,
      scopes,
      snapshot,
      integrations,
    );
    discordStatus = discordResult.status;
    discordError = discordResult.error;
  }

  await upsertSyncState(steamId, {
    sourcebansAdminId,
    sourcebansStatus,
    sourcebansError,
    discordStatus,
    discordError,
  });

  return { sourcebansStatus, sourcebansError, discordStatus, discordError };
}

async function syncStaffUser(
  steamId: string,
  mode: 'designate' | 'demote',
  integrations: StaffIntegrations = defaultIntegrations(),
) {
  return withStaffSyncLock(steamId, () => syncStaffUserUnlocked(steamId, mode, integrations));
}

export async function designateStaff(
  _actorSteamId: string,
  steamId: string,
  permissionLevel: StaffRole,
  assignments: StaffAssignmentPair[],
  integrations: StaffIntegrations = defaultIntegrations(),
) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) notFound('User not found');
  await assertNotLastAdmin(steamId, permissionLevel);

  const permissionChanged = user.permissionLevel !== permissionLevel;

  await prisma.user.update({
    where: { steamId },
    data: {
      permissionLevel,
      ...(permissionChanged ? { sessionVersion: { increment: 1 } } : {}),
    },
  });
  await replaceStaffAssignments(steamId, assignments);
  if (permissionChanged) {
    invalidateCachedSessionVersion(steamId);
  }

  const sync = await syncStaffUser(steamId, 'designate', integrations);
  return { steamId, permissionLevel, ...sync };
}

export async function demoteStaff(
  actorSteamId: string,
  steamId: string,
  integrations: StaffIntegrations = defaultIntegrations(),
) {
  if (actorSteamId === steamId) {
    badRequest('You cannot demote yourself');
  }

  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) notFound('User not found');
  if (!isStaffRole(user.permissionLevel)) {
    badRequest('User is not staff');
  }
  await assertNotLastAdmin(steamId, UserRole.GUEST);

  await prisma.user.update({
    where: { steamId },
    data: {
      permissionLevel: UserRole.GUEST,
      sessionVersion: { increment: 1 },
    },
  });
  await replaceStaffAssignments(steamId, []);
  invalidateCachedSessionVersion(steamId);

  const sync = await syncStaffUser(steamId, 'demote', integrations);
  return { steamId, permissionLevel: UserRole.GUEST, ...sync };
}

export async function retryStaffSync(
  steamId: string,
  integrations: StaffIntegrations = defaultIntegrations(),
) {
  const user = await prisma.user.findUnique({ where: { steamId } });
  if (!user) notFound('User not found');
  const mode = isStaffRole(user.permissionLevel) ? 'designate' : 'demote';
  return syncStaffUser(steamId, mode, integrations);
}

export async function syncStaffDiscordIfNeeded(steamId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { permissionLevel: true },
  });
  if (!user || !isStaffRole(user.permissionLevel)) return;
  try {
    await syncStaffUser(steamId, 'designate');
  } catch (err) {
    console.error('[staff] Discord link sync failed', err);
  }
}

export async function getManagedDiscordRoleIds(): Promise<string[]> {
  const snapshot = await loadMappingSnapshot();
  return [...catalogDiscordRoleIds(snapshot)];
}

export async function stripManagedDiscordRoles(
  discordId: string,
  integrations: StaffIntegrations = defaultIntegrations(),
): Promise<void> {
  if (!discordId || !integrations.discord.configured) return;
  const snapshot = await loadMappingSnapshot();
  const managed = catalogDiscordRoleIds(snapshot);
  if (managed.size === 0) return;
  await integrations.discord.syncMemberRoles(discordId, [], managed);
}

async function staffDiscordIdSet(): Promise<Set<string>> {
  const rows = await prisma.user.findMany({
    where: { permissionLevel: { in: [...STAFF_ROLES] }, discord: { isNot: null } },
    select: { discord: { select: { discordId: true } } },
  });
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.discord?.discordId) ids.add(row.discord.discordId);
  }
  return ids;
}

export async function getOrphanManagedDiscordMembers(): Promise<OrphanManagedDiscordAudit> {
  if (!isDiscordGuildConfigured()) {
    return { configured: false, error: null, members: [] };
  }

  const snapshot = await loadMappingSnapshot();
  const managed = catalogDiscordRoleIds(snapshot);
  if (managed.size === 0) {
    return { configured: true, error: null, members: [] };
  }

  try {
    const [guildMembers, guildRoles, staffDiscordIds] = await Promise.all([
      listDiscordGuildMembers(),
      listDiscordGuildRoles(),
      staffDiscordIdSet(),
    ]);

    const roleNamesById = new Map(guildRoles.map((role) => [role.id, role.name]));
    const orphans = filterOrphanManagedRoleHolders(
      guildMembers,
      staffDiscordIds,
      managed,
      roleNamesById,
    );

    if (orphans.length === 0) {
      return { configured: true, error: null, members: [] };
    }

    const links = await prisma.discord.findMany({
      where: { discordId: { in: orphans.map((orphan) => orphan.discordId) } },
      select: {
        discordId: true,
        playerSteamId: true,
        player: { select: { steamUsername: true } },
      },
    });
    const linkById = new Map(
      links.map((link) => [
        link.discordId,
        {
          steamId: link.playerSteamId,
          steamUsername: link.player?.steamUsername ?? null,
        },
      ]),
    );

    return {
      configured: true,
      error: null,
      members: orphans.map((orphan) => {
        const linked = linkById.get(orphan.discordId);
        return {
          ...orphan,
          linkedSteamId: linked?.steamId ?? null,
          linkedSteamUsername: linked?.steamUsername ?? null,
        };
      }),
    };
  } catch (err) {
    const message =
      err instanceof DiscordGuildError ? err.message : 'Could not list Discord members';
    return { configured: true, error: clipError(message), members: [] };
  }
}

export async function stripOrphanManagedDiscordRoles(
  discordId: string,
  integrations: StaffIntegrations = defaultIntegrations(),
): Promise<void> {
  const trimmed = discordId.trim();
  if (!trimmed) badRequest('Invalid Discord ID');

  const staff = await prisma.user.findFirst({
    where: {
      permissionLevel: { in: [...STAFF_ROLES] },
      discord: { discordId: trimmed },
    },
    select: { steamId: true },
  });
  if (staff) badRequest(ORPHAN_IS_STAFF_MESSAGE);

  await stripManagedDiscordRoles(trimmed, integrations);
}

export async function stripAllOrphanManagedDiscordRoles(
  integrations: StaffIntegrations = defaultIntegrations(),
): Promise<{ stripped: number; failed: number }> {
  const audit = await getOrphanManagedDiscordMembers();
  if (audit.error) badRequest(audit.error);

  let stripped = 0;
  let failed = 0;
  for (const member of audit.members) {
    try {
      await stripOrphanManagedDiscordRoles(member.discordId, integrations);
      stripped += 1;
    } catch {
      failed += 1;
    }
  }
  return { stripped, failed };
}

export async function markStaffDiscordUnlinked(steamId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { steamId },
    select: { permissionLevel: true },
  });
  if (!user || !isStaffRole(user.permissionLevel)) return;

  const existing = await prisma.staffSyncState.findUnique({ where: { steamId } });
  if (!existing) {
    await prisma.staffSyncState.create({
      data: {
        steamId,
        sourcebansStatus: 'PENDING',
        sourcebansError: null,
        discordStatus: 'PENDING',
        discordError: 'Discord is not linked',
        lastSyncedAt: new Date(),
      },
    });
    return;
  }

  await prisma.staffSyncState.update({
    where: { steamId },
    data: {
      discordStatus: 'PENDING',
      discordError: 'Discord is not linked',
      lastSyncedAt: new Date(),
    },
  });
}

export async function resyncAllStaff(
  integrations: StaffIntegrations = defaultIntegrations(),
): Promise<StaffResyncCounts> {
  const users = await prisma.user.findMany({
    where: { permissionLevel: { in: [...STAFF_ROLES] } },
    select: { steamId: true },
    orderBy: { steamId: 'asc' },
  });

  const counts: StaffResyncCounts = { total: users.length, ok: 0, error: 0, pending: 0 };
  for (const user of users) {
    const result = await retryStaffSync(user.steamId, integrations);
    counts[classifyStaffSyncResult(result)] += 1;
  }
  return counts;
}

export async function getStaffRoster() {
  const users = await prisma.user.findMany({
    where: { permissionLevel: { in: [...STAFF_ROLES] } },
    include: {
      discord: true,
      staffAssignments: { include: staffAssignmentInclude },
      staffSyncState: true,
    },
    orderBy: [{ permissionLevel: 'desc' }, { steamUsername: 'asc' }],
  });

  return users.map((user) => ({
    steamId: user.steamId,
    steamUsername: user.steamUsername,
    steamAvatar: user.steamAvatar,
    permissionLevel: user.permissionLevel,
    discordId: user.discord?.discordId ?? null,
    discordUsername: user.discord?.discordUsername ?? null,
    staffAssignments: user.staffAssignments.map(mapStaffAssignmentForDisplay),
    sourcebansStatus: (user.staffSyncState?.sourcebansStatus ??
      'PENDING') as StaffSyncStatusDisplay,
    sourcebansError: user.staffSyncState?.sourcebansError ?? null,
    discordStatus: (user.staffSyncState?.discordStatus ?? 'PENDING') as StaffSyncStatusDisplay,
    discordError: user.staffSyncState?.discordError ?? null,
    lastSyncedAt: user.staffSyncState?.lastSyncedAt?.toISOString() ?? null,
  }));
}

export async function searchUsersForStaff(search: string) {
  const trimmed = search.trim();
  if (trimmed.length < 2) return [];

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { steamUsername: { contains: trimmed, mode: 'insensitive' } },
        { steamId: { contains: trimmed } },
      ],
    },
    select: {
      steamId: true,
      steamUsername: true,
      steamAvatar: true,
      permissionLevel: true,
      discord: { select: { discordUsername: true } },
      staffAssignments: { include: staffAssignmentInclude },
    },
    orderBy: { steamUsername: 'asc' },
    take: 20,
  });

  return users.map((user) => ({
    steamId: user.steamId,
    steamUsername: user.steamUsername,
    steamAvatar: user.steamAvatar,
    permissionLevel: user.permissionLevel,
    discordUsername: user.discord?.discordUsername ?? null,
    isStaff: isStaffRole(user.permissionLevel),
    staffAssignments: user.staffAssignments.map(
      mapStaffAssignmentForDisplay,
    ) as StaffAssignmentDisplay[],
  }));
}

export type StaffRoleMappingInput = {
  permissionLevel: StaffRole;
  sourcebansServerGroupId: number | null;
  sourcebansWebGroupId: number | null;
  sourcebansImmunity: number;
  discordRoleIds: string[];
};

export type StaffDiscordRuleInput = {
  permissionLevel: StaffRole | null;
  formatId: number | null;
  regionId: number | null;
  discordRoleId: string;
};

export type StaffSourcebansServerInput = {
  regionId: number;
  sourcebansServerId: number;
};

export async function getStaffMappings() {
  const snapshot = await loadMappingSnapshot();
  const byRole = new Map(snapshot.roleMappings.map((row) => [row.permissionLevel, row]));

  const roleMappings = STAFF_ROLES.map((permissionLevel) => {
    const existing = byRole.get(permissionLevel);
    return {
      permissionLevel,
      sourcebansServerGroupId: existing?.sourcebansServerGroupId ?? null,
      sourcebansWebGroupId: existing?.sourcebansWebGroupId ?? null,
      sourcebansImmunity: existing?.sourcebansImmunity ?? 0,
      discordRoleIds: existing?.discordRoleIds ?? [],
    };
  });

  return {
    roleMappings,
    discordRules: snapshot.discordRules.map((rule) => ({
      id: rule.id ?? 0,
      permissionLevel: rule.permissionLevel,
      formatId: rule.formatId,
      regionId: rule.regionId,
      discordRoleId: rule.discordRoleId,
    })),
    sourcebansServers: snapshot.sourcebansServers,
  };
}

export async function saveStaffMappings(input: {
  roleMappings: StaffRoleMappingInput[];
  discordRules: StaffDiscordRuleInput[];
  sourcebansServers: StaffSourcebansServerInput[];
}) {
  const roleMappings = input.roleMappings.filter((row) => isStaffRole(row.permissionLevel));
  if (roleMappings.length !== 2) {
    badRequest('Moderator and Admin mappings are required');
  }

  await prisma.$transaction(async (tx) => {
    for (const mapping of roleMappings) {
      await tx.staffRoleMapping.upsert({
        where: { permissionLevel: mapping.permissionLevel },
        create: {
          permissionLevel: mapping.permissionLevel,
          sourcebansServerGroupId: mapping.sourcebansServerGroupId,
          sourcebansWebGroupId: mapping.sourcebansWebGroupId,
          sourcebansImmunity: mapping.sourcebansImmunity,
          discordRoleIds: mapping.discordRoleIds,
        },
        update: {
          sourcebansServerGroupId: mapping.sourcebansServerGroupId,
          sourcebansWebGroupId: mapping.sourcebansWebGroupId,
          sourcebansImmunity: mapping.sourcebansImmunity,
          discordRoleIds: mapping.discordRoleIds,
        },
      });
    }

    await tx.staffDiscordRule.deleteMany();
    if (input.discordRules.length > 0) {
      await tx.staffDiscordRule.createMany({
        data: input.discordRules.map((rule) => ({
          permissionLevel: rule.permissionLevel,
          formatId: rule.formatId,
          regionId: rule.regionId,
          discordRoleId: rule.discordRoleId,
        })),
      });
    }

    await tx.staffSourcebansServer.deleteMany();
    if (input.sourcebansServers.length > 0) {
      await tx.staffSourcebansServer.createMany({
        data: input.sourcebansServers.map((row) => ({
          regionId: row.regionId,
          sourcebansServerId: row.sourcebansServerId,
        })),
      });
    }
  });
}
