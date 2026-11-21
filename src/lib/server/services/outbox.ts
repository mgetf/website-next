/**
 * Outbox for the Discord bot.
 *
 * `enqueueOutbox` runs inside the transaction that changes the bracket, so the
 * messages exist exactly when the change does. The bot then claims rows,
 * delivers them, and acks. A row nobody acks within the lease goes back to the
 * queue, so a crashed bot loses nothing.
 */

import { prisma } from '#lib/server/db.js';
import { getOptionalEnv } from '#lib/server/utils/env.js';
import {
  OUTBOX_LEASE_SECONDS,
  OUTBOX_MAX_ATTEMPTS,
  outboxRetryDelaySeconds,
  type OutboxAckResult,
  type OutboxChannelIds,
} from '#lib/server/utils/outboxEvents.js';
import type { OutboxItem, PlayoffRecipient } from '#lib/server/utils/playoffEvents.js';
import { OutboxStatus, type Prisma } from '#prisma/client.js';

type Client = Prisma.TransactionClient | typeof prisma;

export function siteUrl(path: string): string {
  const origin = getOptionalEnv('PUBLIC_URL', 'https://mge.tf').replace(/\/$/, '');
  return `${origin}${path}`;
}

/** The Discord channels a region has chosen. Null for a kind means the bot's default. */
export async function regionChannels(client: Client, regionId: number): Promise<OutboxChannelIds> {
  const region = await client.region.findUnique({
    where: { id: regionId },
    select: { discordPlayoffsChannelId: true, discordStaffChannelId: true },
  });
  return {
    playoffs: region?.discordPlayoffsChannelId ?? null,
    staff: region?.discordStaffChannelId ?? null,
  };
}

export async function enqueueOutbox(client: Client, items: OutboxItem[]): Promise<void> {
  if (items.length === 0) return;
  await client.outboxEvent.createMany({
    data: items.map((item) => ({
      kind: item.kind,
      dedupeKey: item.dedupeKey,
      payload: item.payload as unknown as Prisma.InputJsonValue,
    })),
    skipDuplicates: true,
  });
}

/**
 * People on these teams who have linked Discord. With `managersOnly` that is
 * leaders and co-leaders, plus the only member of a solo entry, matching who
 * may report a score.
 */
export async function discordRecipients(
  client: Client,
  teamIds: number[],
  options: { managersOnly?: boolean } = {},
): Promise<PlayoffRecipient[]> {
  if (teamIds.length === 0) return [];
  const rows = await client.playerInTeam.findMany({
    where: {
      teamId: { in: teamIds },
      active: 1,
      player: { discord: { isNot: null } },
    },
    select: {
      teamId: true,
      playerSteamId: true,
      permissionLevel: true,
      team: { select: { format: { select: { isIndividual: true } } } },
      player: { select: { discord: { select: { discordId: true } } } },
    },
  });

  const recipients: PlayoffRecipient[] = [];
  for (const row of rows) {
    const discordId = row.player.discord?.discordId;
    if (!discordId) continue;
    const manages = row.permissionLevel >= 1 || row.team.format.isIndividual;
    if (options.managersOnly && !manages) continue;
    recipients.push({ steamId: row.playerSteamId, discordId, teamId: row.teamId });
  }
  return recipients;
}

export type ClaimedOutboxEvent = {
  id: number;
  kind: string;
  /** Attempts made before this one. */
  attempts: number;
  payload: unknown;
};

/**
 * Hand the bot the next batch. Rows that ran out of attempts are buried first.
 * `SKIP LOCKED` lets two bot instances poll without taking the same row.
 */
export async function claimOutboxEvents(limit: number): Promise<ClaimedOutboxEvent[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 50);

  await prisma.$executeRaw`
    UPDATE outbox_events
    SET status = 'DEAD', last_error = COALESCE(last_error, 'Gave up after too many attempts')
    WHERE attempts >= ${OUTBOX_MAX_ATTEMPTS}
      AND (
        (status = 'PENDING' AND next_attempt_at <= now())
        OR (status = 'CLAIMED' AND claimed_at < now() - make_interval(secs => ${OUTBOX_LEASE_SECONDS}))
      )
  `;

  return prisma.$queryRaw<ClaimedOutboxEvent[]>`
    UPDATE outbox_events
    SET status = 'CLAIMED', claimed_at = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM outbox_events
      WHERE (status = 'PENDING' AND next_attempt_at <= now())
         OR (status = 'CLAIMED' AND claimed_at < now() - make_interval(secs => ${OUTBOX_LEASE_SECONDS}))
      ORDER BY id
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, attempts - 1 AS attempts, payload
  `;
}

/** Record what the bot did with a claimed row. Returns false when the row is not claimed. */
export async function ackOutboxEvent(
  id: number,
  result: OutboxAckResult,
  error?: string,
): Promise<boolean> {
  const row = await prisma.outboxEvent.findUnique({
    where: { id },
    select: { status: true, attempts: true },
  });
  if (!row || row.status !== OutboxStatus.CLAIMED) return false;

  const lastError = error ? error.slice(0, 500) : null;
  if (result === 'delivered') {
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.DELIVERED, deliveredAt: new Date(), lastError },
    });
  } else if (result === 'dead' || row.attempts >= OUTBOX_MAX_ATTEMPTS) {
    await prisma.outboxEvent.update({
      where: { id },
      data: { status: OutboxStatus.DEAD, lastError },
    });
  } else {
    await prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxStatus.PENDING,
        nextAttemptAt: new Date(Date.now() + outboxRetryDelaySeconds(row.attempts) * 1000),
        lastError,
      },
    });
  }
  return true;
}
