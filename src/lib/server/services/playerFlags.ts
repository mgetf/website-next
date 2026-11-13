/**
 * Player Flags Service — mod-only staff notes on players.
 *
 * Flags are private to mods/admins. Every create / edit / resolve writes an
 * audit row (USER_FLAGGED / USER_FLAG_UPDATED / USER_FLAG_RESOLVED) which
 * serves as the flag's full history.
 */

import { prisma } from '#lib/server/db.js';
import { notFound, badRequest } from '#lib/server/utils/errors.js';
import { logAudit, AuditAction, AuditCategory } from '#lib/server/services/auditLog.js';

export interface FlagOptions {
  actorSteamId: string;
  actorRole?: string;
  ipAddress?: string;
}

const flagInclude = {
  player: { select: { steamId: true, steamUsername: true, steamAvatar: true } },
  creator: { select: { steamId: true, steamUsername: true } },
  resolver: { select: { steamId: true, steamUsername: true } },
} as const;

export async function listFlags(
  options: { includeResolved?: boolean; playerSteamId?: string } = {},
) {
  const { includeResolved = true, playerSteamId } = options;
  return prisma.playerFlag.findMany({
    where: {
      ...(playerSteamId ? { playerSteamId } : {}),
      ...(includeResolved ? {} : { resolvedAt: null }),
    },
    include: flagInclude,
    orderBy: [{ resolvedAt: 'asc' }, { updatedAt: 'desc' }],
  });
}

export async function getPlayerFlags(playerSteamId: string) {
  return listFlags({ playerSteamId });
}

export async function createFlag(playerSteamId: string, body: string, opts: FlagOptions) {
  const trimmed = body.trim();
  if (!trimmed) badRequest('Note text is required');
  if (trimmed.length > 5000) badRequest('Note is too long (max 5000 characters)');

  const player = await prisma.user.findUnique({ where: { steamId: playerSteamId } });
  if (!player) notFound('Player not found');

  const flag = await prisma.playerFlag.create({
    data: { playerSteamId, body: trimmed, createdBy: opts.actorSteamId },
    include: flagInclude,
  });

  logAudit({
    actorId: opts.actorSteamId,
    actorRole: opts.actorRole,
    category: AuditCategory.USER,
    action: AuditAction.USER_FLAGGED,
    targetType: 'User',
    targetId: playerSteamId,
    metadata: { flagId: flag.id, body: trimmed.slice(0, 500) },
    ipAddress: opts.ipAddress,
  });

  return flag;
}

export async function updateFlag(flagId: number, body: string, opts: FlagOptions) {
  const trimmed = body.trim();
  if (!trimmed) badRequest('Note text is required');
  if (trimmed.length > 5000) badRequest('Note is too long (max 5000 characters)');

  const existing = await prisma.playerFlag.findUnique({ where: { id: flagId } });
  if (!existing) notFound('Flag not found');

  const flag = await prisma.playerFlag.update({
    where: { id: flagId },
    data: { body: trimmed },
    include: flagInclude,
  });

  logAudit({
    actorId: opts.actorSteamId,
    actorRole: opts.actorRole,
    category: AuditCategory.USER,
    action: AuditAction.USER_FLAG_UPDATED,
    targetType: 'User',
    targetId: flag.playerSteamId,
    metadata: { flagId, body: trimmed.slice(0, 500) },
    ipAddress: opts.ipAddress,
  });

  return flag;
}

export async function resolveFlag(flagId: number, opts: FlagOptions) {
  const existing = await prisma.playerFlag.findUnique({ where: { id: flagId } });
  if (!existing) notFound('Flag not found');
  if (existing.resolvedAt) badRequest('Flag is already resolved');

  const flag = await prisma.playerFlag.update({
    where: { id: flagId },
    data: { resolvedAt: new Date(), resolvedBy: opts.actorSteamId },
    include: flagInclude,
  });

  logAudit({
    actorId: opts.actorSteamId,
    actorRole: opts.actorRole,
    category: AuditCategory.USER,
    action: AuditAction.USER_FLAG_RESOLVED,
    targetType: 'User',
    targetId: flag.playerSteamId,
    metadata: { flagId },
    ipAddress: opts.ipAddress,
  });

  return flag;
}
