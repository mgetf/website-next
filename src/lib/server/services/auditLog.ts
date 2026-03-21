/**
 * Audit Log Service
 *
 * Centralized audit trail for all significant actions in the system.
 * logAudit() is fire-and-forget — failures never propagate to callers.
 */

import { prisma } from '$lib/server/db';

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
  // AUTH
  AUTH_LOGIN: 'AUTH_LOGIN',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_DISCORD_LINKED: 'AUTH_DISCORD_LINKED',
  AUTH_DISCORD_UNLINKED: 'AUTH_DISCORD_UNLINKED',

  // USER
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_BANNED: 'USER_BANNED',
  USER_UNBANNED: 'USER_UNBANNED',
  USER_NAME_LOCKED: 'USER_NAME_LOCKED',
  USER_NAME_UNLOCKED: 'USER_NAME_UNLOCKED',
  USER_AVATAR_LOCKED: 'USER_AVATAR_LOCKED',
  USER_AVATAR_UNLOCKED: 'USER_AVATAR_UNLOCKED',
  USER_DISCORD_UNLINKED: 'USER_DISCORD_UNLINKED',

  // TEAM
  TEAM_CREATED: 'TEAM_CREATED',
  TEAM_UPDATED: 'TEAM_UPDATED',
  TEAM_AVATAR_CHANGED: 'TEAM_AVATAR_CHANGED',
  TEAM_DISBANDED: 'TEAM_DISBANDED',
  TEAM_DELETED: 'TEAM_DELETED',
  TEAM_STATUS_CHANGED: 'TEAM_STATUS_CHANGED',
  TEAM_DIVISION_CHANGED: 'TEAM_DIVISION_CHANGED',

  // ROSTER
  PLAYER_JOINED: 'PLAYER_JOINED',
  PLAYER_REMOVED: 'PLAYER_REMOVED',
  PLAYER_PROMOTED: 'PLAYER_PROMOTED',
  PLAYER_DEMOTED: 'PLAYER_DEMOTED',
  PLAYER_INVITED: 'PLAYER_INVITED',
  PLAYER_APPROVED: 'PLAYER_APPROVED',
  PLAYER_DENIED: 'PLAYER_DENIED',

  // MATCH
  MATCH_CREATED: 'MATCH_CREATED',
  MATCH_SCORES_SUBMITTED: 'MATCH_SCORES_SUBMITTED',
  MATCH_DISPUTED: 'MATCH_DISPUTED',
  MATCH_DISPUTE_RESOLVED: 'MATCH_DISPUTE_RESOLVED',
  MATCH_STATUS_CHANGED: 'MATCH_STATUS_CHANGED',
  MATCH_SCORES_OVERRIDDEN: 'MATCH_SCORES_OVERRIDDEN',

  // MAP_BAN
  MAP_BAN_INITIALIZED: 'MAP_BAN_INITIALIZED',
  MAP_BANNED: 'MAP_BANNED',
  MAP_PICKED: 'MAP_PICKED',
  MAP_POOL_CREATED: 'MAP_POOL_CREATED',
  MAP_POOL_UPDATED: 'MAP_POOL_UPDATED',

  // SIGNUP
  SIGNUP_1V1_CREATED: 'SIGNUP_1V1_CREATED',
  SIGNUP_1V1_WITHDRAWN: 'SIGNUP_1V1_WITHDRAWN',
  SIGNUP_SEASON_CHANGED: 'SIGNUP_SEASON_CHANGED',

  // PAYMENT
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_MARKED_MANUALLY: 'PAYMENT_MARKED_MANUALLY',
  ITEM_ORDER_CREATED: 'ITEM_ORDER_CREATED',
  ITEM_ORDER_CANCELLED: 'ITEM_ORDER_CANCELLED',
  ITEM_ORDER_EXPIRED: 'ITEM_ORDER_EXPIRED',
  ITEM_PAYMENT_CONFIRMED: 'ITEM_PAYMENT_CONFIRMED',
  ITEM_PAYMENT_DECLINED: 'ITEM_PAYMENT_DECLINED',

  // DEMO
  DEMO_UPLOADED: 'DEMO_UPLOADED',
  DEMO_REPORTED: 'DEMO_REPORTED',
  DEMO_REPORT_REVIEWED: 'DEMO_REPORT_REVIEWED',

  // LEAGUE_CONFIG
  SEASON_CREATED: 'SEASON_CREATED',
  SEASON_UPDATED: 'SEASON_UPDATED',
  SEASON_DELETED: 'SEASON_DELETED',
  REGION_CREATED: 'REGION_CREATED',
  REGION_TOGGLED: 'REGION_TOGGLED',
  REGION_DELETED: 'REGION_DELETED',
  DIVISION_CREATED: 'DIVISION_CREATED',
  DIVISION_UPDATED: 'DIVISION_UPDATED',
  DIVISION_DELETED: 'DIVISION_DELETED',
  FORMAT_CREATED: 'FORMAT_CREATED',
  FORMAT_UPDATED: 'FORMAT_UPDATED',
  FORMAT_DELETED: 'FORMAT_DELETED',
  ARENA_CREATED: 'ARENA_CREATED',
  ARENA_UPDATED: 'ARENA_UPDATED',
  ARENA_DELETED: 'ARENA_DELETED',
  PLAYOFF_UPDATED: 'PLAYOFF_UPDATED',

  // TOURNAMENT
  TOURNAMENT_CREATED: 'TOURNAMENT_CREATED',
  TOURNAMENT_UPDATED: 'TOURNAMENT_UPDATED',
  CHAMPIONSHIP_CREATED: 'CHAMPIONSHIP_CREATED',
  CHAMPIONSHIP_UPDATED: 'CHAMPIONSHIP_UPDATED',

  // SITE
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

// ─── Core types ───────────────────────────────────────────────────────────────

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

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit log write.
 * Never throws — audit failures must not disrupt the main operation.
 */
export async function logAudit(params: AuditLogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId ?? null,
        actorRole: params.actorRole ?? null,
        category: params.category,
        action: params.action,
        targetType: params.targetType ?? null,
        targetId: params.targetId ?? null,
        metadata:
          (params.metadata as Record<string, string | number | boolean | null>) ?? undefined,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log entry:', err);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Paginated query for the admin audit log viewer.
 */
export async function getAuditLogs(filters: AuditLogFilters = {}) {
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

  const where: Record<string, unknown> = {};

  if (category) where.category = category;
  if (action) where.action = action;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;

  if (actorId) {
    where.actorId = { contains: actorId };
  }

  if (dateFrom || dateTo) {
    where.timestamp = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const [logs, totalCount] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            steamId: true,
            steamUsername: true,
            steamAvatar: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const targetUserIds = [
    ...new Set(logs.filter((l) => l.targetType === 'User' && l.targetId).map((l) => l.targetId!)),
  ];

  const targetUsersMap = new Map<
    string,
    { steamUsername: string | null; steamAvatar: string | null }
  >();

  if (targetUserIds.length > 0) {
    const targetUsers = await prisma.user.findMany({
      where: { steamId: { in: targetUserIds } },
      select: { steamId: true, steamUsername: true, steamAvatar: true },
    });
    for (const u of targetUsers) {
      targetUsersMap.set(u.steamId, { steamUsername: u.steamUsername, steamAvatar: u.steamAvatar });
    }
  }

  const logsWithTargetUsers = logs.map((log) => ({
    ...log,
    targetUser:
      log.targetType === 'User' && log.targetId ? (targetUsersMap.get(log.targetId) ?? null) : null,
  }));

  return {
    logs: logsWithTargetUsers,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
      hasNextPage: page < Math.ceil(totalCount / pageSize),
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Count of logs per category for the admin dashboard.
 */
export async function getAuditLogStats() {
  const rows = await prisma.auditLog.groupBy({
    by: ['category'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return rows.map((r) => ({
    category: r.category,
    count: r._count.id,
  }));
}
