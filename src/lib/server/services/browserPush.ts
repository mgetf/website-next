/**
 * Operating-system notifications via the Web Push protocol.
 * The in-site bell is unchanged when VAPID keys are not configured.
 */

import webpush from 'web-push';
import { prisma } from '#lib/server/db.js';
import { getVapidPrivateKey, getVapidPublicKey, getVapidSubject } from '#lib/server/utils/env.js';

export interface BrowserPushInput {
  id: number;
  userSteamId: string;
  type: string;
  url: string;
  message: string | null;
}

const TITLES: Record<string, string> = {
  MATCH_COMM: 'Match update',
  PENDING_PLAYER: 'Join request',
  MATCH_CREATED: 'Match scheduled',
  PLAYER_INVITE: 'Team invitation',
  ADMIN_ACTION: 'Admin action',
  BYE_WEEK: 'Bye week',
};

let configuredKeys = '';
let warnedPartialKeys = false;

export function browserPushTitle(type: string): string {
  return TITLES[type] ?? 'mge.tf';
}

/**
 * Relative site paths only. A notification click must not leave mge.tf.
 */
export function browserPushUrl(url: string): string {
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return '/';
}

export function buildBrowserPushPayload(input: Omit<BrowserPushInput, 'userSteamId'>): string {
  const title = browserPushTitle(input.type);
  const message = input.message?.trim();
  return JSON.stringify({
    title,
    body: (message || title).slice(0, 180),
    url: browserPushUrl(input.url),
    tag: `notification-${input.id}`,
  });
}

/** Push services use 404 and 410 when the browser dropped the subscription. */
export function isStalePushStatus(status: number): boolean {
  return status === 404 || status === 410;
}

export function getVapidKeyPair(): { publicKey: string; privateKey: string } | null {
  const publicKey = getVapidPublicKey();
  const privateKey = getVapidPrivateKey();
  if (publicKey && privateKey) return { publicKey, privateKey };
  if ((publicKey || privateKey) && !warnedPartialKeys) {
    warnedPartialKeys = true;
    console.warn('[browserPush] Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
  }
  return null;
}

function pushClient(): typeof webpush | null {
  const keys = getVapidKeyPair();
  if (!keys) return null;
  const marker = `${keys.publicKey}:${keys.privateKey}`;
  if (configuredKeys !== marker) {
    webpush.setVapidDetails(getVapidSubject(), keys.publicKey, keys.privateKey);
    configuredKeys = marker;
  }
  return webpush;
}

function statusCode(err: unknown): number {
  if (err instanceof webpush.WebPushError) return err.statusCode;
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const status = err.statusCode;
    if (typeof status === 'number') return status;
  }
  return 0;
}

export async function savePushSubscription(
  userSteamId: string,
  input: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userSteamId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    },
    update: {
      userSteamId,
      p256dh: input.p256dh,
      auth: input.auth,
    },
  });
}

export async function removePushSubscription(userSteamId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { userSteamId, endpoint },
  });
}

/**
 * Send one operating-system notification. Failures stay here so saving the
 * in-site notification never depends on a push service.
 *
 * Every push must display a notification. Chrome revokes the subscription
 * when a push handler stays silent, including when an mge.tf tab is focused.
 */
export async function deliverBrowserPush(input: BrowserPushInput): Promise<void> {
  try {
    const client = pushClient();
    if (!client) return;

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userSteamId: input.userSteamId },
      select: { endpoint: true, p256dh: true, auth: true },
    });
    if (subscriptions.length === 0) return;

    const payload = buildBrowserPushPayload(input);
    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await client.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (err) {
          const status = statusCode(err);
          if (isStalePushStatus(status)) {
            await prisma.pushSubscription.deleteMany({
              where: { endpoint: subscription.endpoint },
            });
            return;
          }
          console.error(
            '[browserPush] send failed:',
            status || (err instanceof Error ? err.message : err),
          );
        }
      }),
    );
  } catch (err) {
    console.error('[browserPush] delivery failed:', err instanceof Error ? err.message : err);
  }
}
