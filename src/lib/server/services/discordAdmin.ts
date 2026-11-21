/**
 * What admins see of the Discord bot: whether it is alive, how the outbox is
 * doing, and the direct messages people sent it.
 */

import { prisma } from '#lib/server/db.js';
import { createNotificationForAdmins } from '#lib/server/services/notifications.js';
import { notFound } from '#lib/server/utils/errors.js';
import { OutboxStatus, Prisma } from '#prisma/client.js';

const MAX_TEXT = 4000;
const BOT_STATUS_ID = 1;
/** The bot polls every few seconds; this long without one means it is down. */
export const BOT_STALE_AFTER_MS = 2 * 60 * 1000;

export async function touchBotStatus(events: number): Promise<void> {
  const now = new Date();
  await prisma.botStatus.upsert({
    where: { id: BOT_STATUS_ID },
    create: { id: BOT_STATUS_ID, lastPollAt: now, lastPollEvents: events },
    update: { lastPollAt: now, lastPollEvents: events },
  });
}

export type InboxInput = {
  discordMessageId: string;
  discordUserId: string;
  discordUsername: string;
  content: string;
  attachments?: Array<{ name: string; url: string }>;
  replyToMessageId?: string | null;
};

/** Store a DM the bot received. Safe to repeat: the same Discord message is stored once. */
export async function recordInboxMessage(input: InboxInput): Promise<{ created: boolean }> {
  const existing = await prisma.discordInboxMessage.findUnique({
    where: { discordMessageId: input.discordMessageId },
    select: { id: true },
  });
  if (existing) return { created: false };

  const [link, replied] = await Promise.all([
    prisma.discord.findUnique({
      where: { discordId: input.discordUserId },
      select: { playerSteamId: true },
    }),
    input.replyToMessageId
      ? prisma.outboxEvent.findFirst({
          where: { discordMessageId: input.replyToMessageId },
          select: { id: true },
        })
      : null,
  ]);

  const username = input.discordUsername.slice(0, 100);
  await prisma.discordInboxMessage.create({
    data: {
      discordMessageId: input.discordMessageId,
      discordUserId: input.discordUserId,
      discordUsername: username,
      steamId: link?.playerSteamId ?? null,
      content: input.content.slice(0, MAX_TEXT),
      attachments: input.attachments?.length
        ? (input.attachments.slice(0, 10) as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      replyToMessageId: input.replyToMessageId ?? null,
      outboxEventId: replied?.id ?? null,
    },
  });

  await createNotificationForAdmins(
    'ADMIN_ACTION',
    '/admin/discord',
    `New Discord DM from ${username}: ${input.content.slice(0, 80)}`,
  );
  return { created: true };
}

export type OutboxCounts = Record<OutboxStatus, number>;

export type DiscordOverview = {
  bot: { lastPollAt: Date | null; lastPollEvents: number; online: boolean };
  counts: OutboxCounts;
  /** Seconds the oldest waiting message has been waiting, or null when none wait. */
  oldestPendingSeconds: number | null;
  last24h: Array<{ kind: string; delivered: number; dead: number; waiting: number }>;
  unhandledInbox: number;
};

export async function getDiscordOverview(now: Date = new Date()): Promise<DiscordOverview> {
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const [status, byStatus, oldest, recent, unhandledInbox] = await Promise.all([
    prisma.botStatus.findUnique({ where: { id: BOT_STATUS_ID } }),
    prisma.outboxEvent.groupBy({ by: ['status'], _count: true }),
    prisma.outboxEvent.findFirst({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    prisma.outboxEvent.groupBy({
      by: ['kind', 'status'],
      where: { createdAt: { gte: dayAgo } },
      _count: true,
    }),
    prisma.discordInboxMessage.count({ where: { handledAt: null } }),
  ]);

  const counts: OutboxCounts = { PENDING: 0, CLAIMED: 0, DELIVERED: 0, DEAD: 0 };
  for (const row of byStatus) counts[row.status] = row._count;

  const kinds = new Map<
    string,
    { kind: string; delivered: number; dead: number; waiting: number }
  >();
  for (const row of recent) {
    const entry = kinds.get(row.kind) ?? { kind: row.kind, delivered: 0, dead: 0, waiting: 0 };
    if (row.status === OutboxStatus.DELIVERED) entry.delivered += row._count;
    else if (row.status === OutboxStatus.DEAD) entry.dead += row._count;
    else entry.waiting += row._count;
    kinds.set(row.kind, entry);
  }

  return {
    bot: {
      lastPollAt: status?.lastPollAt ?? null,
      lastPollEvents: status?.lastPollEvents ?? 0,
      online: status != null && now.getTime() - status.lastPollAt.getTime() < BOT_STALE_AFTER_MS,
    },
    counts,
    oldestPendingSeconds: oldest
      ? Math.max(0, Math.round((now.getTime() - oldest.createdAt.getTime()) / 1000))
      : null,
    last24h: [...kinds.values()].sort((a, b) => a.kind.localeCompare(b.kind)),
    unhandledInbox,
  };
}

export type OutboxListItem = {
  id: number;
  kind: string;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  /** Who or where it went: a Discord ID for a DM, or the channel name. */
  target: string;
  matchUrl: string | null;
};

function describeTarget(payload: unknown): { target: string; matchUrl: string | null } {
  const p = (payload ?? {}) as {
    target?: { type?: string; discordId?: string; channel?: string };
    url?: string;
  };
  const target =
    p.target?.type === 'dm'
      ? `DM ${p.target.discordId ?? ''}`
      : p.target?.type === 'channel'
        ? `#${p.target.channel ?? 'channel'}`
        : 'unknown';
  return { target, matchUrl: typeof p.url === 'string' ? p.url : null };
}

export async function listOutboxEvents(filter: {
  status?: OutboxStatus;
  kind?: string;
  take?: number;
}): Promise<OutboxListItem[]> {
  const rows = await prisma.outboxEvent.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
    },
    orderBy: { id: 'desc' },
    take: Math.min(filter.take ?? 50, 200),
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
    ...describeTarget(row.payload),
  }));
}

/** Put a dead (or stuck) message back in the queue for another go. */
export async function requeueOutboxEvent(id: number): Promise<void> {
  const result = await prisma.outboxEvent.updateMany({
    where: { id, status: { in: [OutboxStatus.DEAD, OutboxStatus.CLAIMED] } },
    data: { status: OutboxStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  if (result.count === 0) notFound('That message is not dead or stuck');
}

export async function requeueDeadOutboxEvents(kind?: string): Promise<number> {
  const result = await prisma.outboxEvent.updateMany({
    where: { status: OutboxStatus.DEAD, ...(kind ? { kind } : {}) },
    data: { status: OutboxStatus.PENDING, attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  return result.count;
}

export async function listInbox(filter: { unhandledOnly?: boolean; take?: number }) {
  const rows = await prisma.discordInboxMessage.findMany({
    where: filter.unhandledOnly ? { handledAt: null } : {},
    orderBy: { id: 'desc' },
    take: Math.min(filter.take ?? 50, 200),
  });
  const steamIds = [...new Set(rows.map((row) => row.steamId).filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({
    where: { steamId: { in: steamIds } },
    select: { steamId: true, steamUsername: true },
  });
  const names = new Map(users.map((user) => [user.steamId, user.steamUsername]));

  const eventIds = rows.map((row) => row.outboxEventId).filter((id): id is number => id != null);
  const events = await prisma.outboxEvent.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, kind: true, payload: true },
  });
  const eventById = new Map(events.map((event) => [event.id, event]));

  return rows.map((row) => {
    const event = row.outboxEventId != null ? eventById.get(row.outboxEventId) : undefined;
    return {
      id: row.id,
      discordUserId: row.discordUserId,
      discordUsername: row.discordUsername,
      steamId: row.steamId,
      steamUsername: row.steamId ? (names.get(row.steamId) ?? null) : null,
      content: row.content,
      attachments: (row.attachments as Array<{ name: string; url: string }> | null) ?? [],
      createdAt: row.createdAt,
      handledAt: row.handledAt,
      handledBy: row.handledBy,
      /** The notification this was a reply to. */
      repliedTo: event ? { kind: event.kind, url: describeTarget(event.payload).matchUrl } : null,
    };
  });
}

export async function markInboxHandled(id: number, handledBy: string): Promise<void> {
  const result = await prisma.discordInboxMessage.updateMany({
    where: { id, handledAt: null },
    data: { handledAt: new Date(), handledBy },
  });
  if (result.count === 0) notFound('That message was already handled');
}

export async function markAllInboxHandled(handledBy: string): Promise<number> {
  const result = await prisma.discordInboxMessage.updateMany({
    where: { handledAt: null },
    data: { handledAt: new Date(), handledBy },
  });
  return result.count;
}
