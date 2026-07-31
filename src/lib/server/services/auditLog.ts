/**
 * Audit Log Service — Rama GlobalsModule (no Prisma).
 * logAudit() is fire-and-forget — failures never propagate to callers.
 */

import { isRamaBackend, ramaClientOpts } from '$lib/server/rama/config';
import {
  appendAudit,
  createGlobalsClient,
  getAudit,
  getAuditIdMap,
} from '$lib/server/rama/globals';
import { createUsersClient, getUser } from '$lib/server/rama/users';
import type { AuditLogStatsRow, AuditLogsResult } from '$lib/types/service-models';

// ─── Categories ───────────────────────────────────────────────────────────────

export const AuditCategory = {
  AUTH: 'AUTH',
  USER: 'USER',
  TEAM: 'TEAM',
  ROSTER: 'ROSTER',
  MATCH: 'MATCH',
  MAP_BAN: 'MAP_BAN',
  SIGNUP: 'SIGNUP',
  PAYMENT: 'PAYMENT',
  DEMO: 'DEMO',
  LEAGUE_CONFIG: 'LEAGUE_CONFIG',
  TOURNAMENT: 'TOURNAMENT',
  SITE: 'SITE',
} as const;

export type AuditCategory = (typeof AuditCategory)[keyof typeof AuditCategory];

// ─── Actions ──────────────────────────────────────────────────────────────────

export const AuditAction = {
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_DISCORD_LINKED: 'AUTH_DISCORD_LINKED',
  AUTH_DISCORD_UNLINKED: 'AUTH_DISCORD_UNLINKED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_BANNED: 'USER_BANNED',
  USER_UNBANNED: 'USER_UNBANNED',
  USER_NAME_LOCKED: 'USER_NAME_LOCKED',
  USER_NAME_UNLOCKED: 'USER_NAME_UNLOCKED',
  USER_AVATAR_LOCKED: 'USER_AVATAR_LOCKED',
  USER_AVATAR_UNLOCKED: 'USER_AVATAR_UNLOCKED',
  USER_DISCORD_UNLINKED: 'USER_DISCORD_UNLINKED',
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_UPDATED: 'TEAM_UPDATED',
  TEAM_AVATAR_CHANGED: 'TEAM_AVATAR_CHANGED',
  TEAM_DISBANDED: 'TEAM_DISBANDED',
  TEAM_DELETED: 'TEAM_DELETED',
  TEAM_STATUS_CHANGED: 'TEAM_STATUS_CHANGED',
  TEAM_DIVISION_CHANGED: 'TEAM_DIVISION_CHANGED',
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_REMOVED: 'PLAYER_REMOVED',
  PLAYER_PROMOTED: 'PLAYER_PROMOTED',
  PLAYER_DEMOTED: 'PLAYER_DEMOTED',
  PLAYER_INVITED: 'PLAYER_INVITED',
  PLAYER_APPROVED: 'PLAYER_APPROVED',
  PLAYER_DENIED: 'PLAYER_DENIED',
  MATCH_CREATED: 'MATCH_CREATED',
  MATCH_SCORES_SUBMITTED: 'MATCH_SCORES_SUBMITTED',
  MATCH_DISPUTED: 'MATCH_DISPUTED',
  MATCH_DISPUTE_RESOLVED: 'MATCH_DISPUTE_RESOLVED',
  MATCH_STATUS_CHANGED: 'MATCH_STATUS_CHANGED',
  MATCH_SCORES_OVERRIDDEN: 'MATCH_SCORES_OVERRIDDEN',
  MATCH_SCHEDULE_UPDATED: 'MATCH_SCHEDULE_UPDATED',
  MATCH_ARENAS_UPDATED: 'MATCH_ARENAS_UPDATED',
  MATCH_DELETED: 'MATCH_DELETED',
  MAP_BAN_INITIALIZED: 'MAP_BAN_INITIALIZED',
  MAP_BANNED: 'MAP_BANNED',
  MAP_PICKED: 'MAP_PICKED',
  MAP_POOL_CREATED: 'MAP_POOL_CREATED',
  MAP_POOL_UPDATED: 'MAP_POOL_UPDATED',
  MAP_FILE_UPLOADED: 'MAP_FILE_UPLOADED',
  MAP_FILE_UPDATED: 'MAP_FILE_UPDATED',
  MAP_FILE_DELETED: 'MAP_FILE_DELETED',
  SIGNUP_1V1_CREATED: 'SIGNUP_1V1_CREATED',
  SIGNUP_1V1_WITHDRAWN: 'SIGNUP_1V1_WITHDRAWN',
  SIGNUP_SEASON_CHANGED: 'SIGNUP_SEASON_CHANGED',
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_MARKED_MANUALLY: 'PAYMENT_MARKED_MANUALLY',
  ITEM_ORDER_CREATED: 'ITEM_ORDER_CREATED',
  ITEM_ORDER_CANCELLED: 'ITEM_ORDER_CANCELLED',
  ITEM_ORDER_EXPIRED: 'ITEM_ORDER_EXPIRED',
  ITEM_PAYMENT_CONFIRMED: 'ITEM_PAYMENT_CONFIRMED',
  ITEM_PAYMENT_DECLINED: 'ITEM_PAYMENT_DECLINED',
  DEMO_UPLOADED: 'DEMO_UPLOADED',
  DEMO_REPORTED: 'DEMO_REPORTED',
  DEMO_REPORT_REVIEWED: 'DEMO_REPORT_REVIEWED',
  SEASON_CREATED: 'SEASON_CREATED',
  SEASON_UPDATED: 'SEASON_UPDATED',
  SEASON_DELETED: 'SEASON_DELETED',
  REGION_CREATED: 'REGION_CREATED',
  REGION_TOGGLED: 'REGION_TOGGLED',
  REGION_DELETED: 'REGION_DELETED',
  DIVISION_CREATED: 'DIVISION_CREATED',
  DIVISION_UPDATED: 'DIVISION_UPDATED',
  DIVISION_TOGGLED: 'DIVISION_TOGGLED',
  DIVISION_DELETED: 'DIVISION_DELETED',
  FORMAT_CREATED: 'FORMAT_CREATED',
  FORMAT_UPDATED: 'FORMAT_UPDATED',
  FORMAT_DELETED: 'FORMAT_DELETED',
  ARENA_CREATED: 'ARENA_CREATED',
  ARENA_UPDATED: 'ARENA_UPDATED',
  ARENA_DELETED: 'ARENA_DELETED',
  PLAYOFF_UPDATED: 'PLAYOFF_UPDATED',
  TOURNAMENT_CREATED: 'TOURNAMENT_CREATED',
  TOURNAMENT_UPDATED: 'TOURNAMENT_UPDATED',
  TOURNAMENT_DRAFT_CREATED: 'TOURNAMENT_DRAFT_CREATED',
  TOURNAMENT_DRAFT_SAVED: 'TOURNAMENT_DRAFT_SAVED',
  TOURNAMENT_PUBLISHED: 'TOURNAMENT_PUBLISHED',
  TOURNAMENT_REVISION_RESTORED: 'TOURNAMENT_REVISION_RESTORED',
  CHAMPIONSHIP_CREATED: 'CHAMPIONSHIP_CREATED',
  CHAMPIONSHIP_UPDATED: 'CHAMPIONSHIP_UPDATED',
  CONTENT_UPDATED: 'CONTENT_UPDATED',
  SITE_SETTINGS_UPDATED: 'SITE_SETTINGS_UPDATED',
  API_KEY_CREATED: 'API_KEY_CREATED',
  API_KEY_TOGGLED: 'API_KEY_TOGGLED',
  API_KEY_DELETED: 'API_KEY_DELETED',
  ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
  ANNOUNCEMENT_UPDATED: 'ANNOUNCEMENT_UPDATED',
  ANNOUNCEMENT_TOGGLED: 'ANNOUNCEMENT_TOGGLED',
  ANNOUNCEMENT_DELETED: 'ANNOUNCEMENT_DELETED',
  GLOBAL_SETTINGS_UPDATED: 'GLOBAL_SETTINGS_UPDATED',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditLogParams {
  actorId?: string | null;
  actorRole?: string | null;
  category: AuditCategory;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface AuditLogFilters {
  category?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

function nextAuditId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function parseMetadata(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Fire-and-forget audit log write.
 * Never throws — audit failures must not disrupt the main operation.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    if (!isRamaBackend()) {
      console.error('[AuditLog] DATA_BACKEND must be rama');
      return;
    }
    const client = createGlobalsClient(ramaClientOpts());
    const ack = await appendAudit(client, {
      auditId: nextAuditId(),
      actorId: params.actorId ?? null,
      actorRole: params.actorRole ?? null,
      category: params.category,
      action: params.action,
      targetType: params.targetType ?? null,
      targetId: params.targetId ?? null,
      metadata: params.metadata != null ? JSON.stringify(params.metadata) : null,
      ipAddress: params.ipAddress ?? null,
      createdAt: new Date().toISOString(),
    });
    if (!ack.ok) {
      console.error('[AuditLog] Rama append-audit failed:', ack.error);
    }
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log entry:', err);
  }
}

/**
 * Paginated query for the admin audit log viewer.
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogsResult> {
  const {
    category,
    actorId,
    targetType,
    targetId,
    action,
    dateFrom,
    dateTo,
    page = 1,
    pageSize = 50,
  } = filters;

  if (!isRamaBackend()) {
    return {
      logs: [],
      pagination: {
        page,
        pageSize,
        totalCount: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const opts = ramaClientOpts();
  const globals = createGlobalsClient(opts);
  const users = createUsersClient(opts);
  const idMap = await getAuditIdMap(globals);

  let entries = Object.entries(idMap).sort((a, b) => {
    const ta = a[1] || '';
    const tb = b[1] || '';
    return tb.localeCompare(ta) || b[0].localeCompare(a[0]);
  });

  if (category) entries = entries.filter(([id]) => id); // filter after load
  const rows = await Promise.all(
    entries.map(async ([id, createdAt]) => {
      const row = await getAudit(globals, id);
      if (!row) return null;
      return { id, createdAt, row };
    }),
  );

  let filtered = rows.filter((r): r is NonNullable<typeof r> => r != null);
  if (category) filtered = filtered.filter((r) => r.row.category === category);
  if (action) filtered = filtered.filter((r) => r.row.action === action);
  if (targetType) filtered = filtered.filter((r) => r.row.targetType === targetType);
  if (targetId) filtered = filtered.filter((r) => r.row.targetId === targetId);
  if (actorId) {
    filtered = filtered.filter((r) => (r.row.actorId || '').includes(actorId));
  }
  if (dateFrom) {
    filtered = filtered.filter((r) => new Date(r.row.createdAt || r.createdAt) >= dateFrom);
  }
  if (dateTo) {
    filtered = filtered.filter((r) => new Date(r.row.createdAt || r.createdAt) <= dateTo);
  }

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const logs = await Promise.all(
    pageRows.map(async ({ id, createdAt, row }) => {
      const actor = row.actorId ? await getUser(users, row.actorId) : null;
      const targetUser =
        row.targetType === 'User' && row.targetId ? await getUser(users, row.targetId) : null;
      return {
        id,
        actorId: row.actorId || null,
        actorRole: row.actorRole || null,
        category: row.category,
        action: row.action,
        targetType: row.targetType || null,
        targetId: row.targetId || null,
        metadata: parseMetadata(row.metadata),
        ipAddress: row.ipAddress || null,
        timestamp: new Date(row.createdAt || createdAt),
        actor: actor
          ? {
              steamId: row.actorId,
              steamUsername: String(actor.username ?? null),
              steamAvatar: String(actor.avatarUrl ?? null),
            }
          : null,
        targetUser: targetUser
          ? {
              steamUsername: String(targetUser.username ?? null),
              steamAvatar: String(targetUser.avatarUrl ?? null),
            }
          : null,
      };
    }),
  );

  return {
    logs,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Count of logs per category for the admin dashboard.
 */
export async function getAuditLogStats(): Promise<AuditLogStatsRow[]> {
  if (!isRamaBackend()) return [];
  const { logs } = await getAuditLogs({ page: 1, pageSize: 10_000 });
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.category, (counts.get(log.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
