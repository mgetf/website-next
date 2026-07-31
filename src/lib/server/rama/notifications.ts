/**
 * Typed helpers for NotificationsModule over Rama REST JSON.
 *
 * @lintignore Spike notification helpers; production still uses Postgres + pg_notify.
 */

import { RamaClient, type AckLevel } from './client';

export const NOTIFICATIONS_MODULE = 'mge.tf.rama.notifications-module/NotificationsModule';
export const NOTIFICATION_DEPOT = '*notification-depot';

export type NotificationAck = {
  ok: boolean;
  error?: string;
  steamId?: string;
  id?: string;
  unread?: number;
  type?: string;
};

function asAck(topologyReturns: Record<string, unknown>): NotificationAck {
  const raw = topologyReturns['notifications'];
  if (raw && typeof raw === 'object') return raw as NotificationAck;
  return { ok: false, error: 'missing-ack' };
}

export function createNotificationsClient(opts: {
  conductorUrl: string;
  supervisorBaseUrl?: string;
}): RamaClient {
  return new RamaClient({
    conductorUrl: opts.conductorUrl,
    supervisorBaseUrl: opts.supervisorBaseUrl,
    moduleName: NOTIFICATIONS_MODULE,
  });
}

export async function notify(
  client: RamaClient,
  event: {
    steamId: string;
    id: string;
    notifType: string;
    body: string;
    href?: string;
    createdAt: string;
  },
  ackLevel: AckLevel = 'ack',
): Promise<NotificationAck> {
  return asAck(await client.append(NOTIFICATION_DEPOT, { type: 'notify', ...event }, ackLevel));
}

export async function markRead(
  client: RamaClient,
  event: { steamId: string; id: string },
  ackLevel: AckLevel = 'ack',
): Promise<NotificationAck> {
  return asAck(await client.append(NOTIFICATION_DEPOT, { type: 'mark-read', ...event }, ackLevel));
}

export async function markAllRead(
  client: RamaClient,
  steamId: string,
  ackLevel: AckLevel = 'ack',
): Promise<NotificationAck> {
  return asAck(
    await client.append(NOTIFICATION_DEPOT, { type: 'mark-all-read', steamId }, ackLevel),
  );
}

export async function getUnreadCount(client: RamaClient, steamId: string): Promise<number> {
  try {
    const v = await client.selectOne('$$unread-count', [steamId]);
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

export type RamaNotification = {
  type: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};

/** All notifications for a user: id → fields. */
export async function getNotifications(
  client: RamaClient,
  steamId: string,
): Promise<Record<string, RamaNotification>> {
  try {
    const v = await client.selectOne('$$notifications', [steamId]);
    if (!v || typeof v !== 'object') return {};
    return v as Record<string, RamaNotification>;
  } catch {
    return {};
  }
}
