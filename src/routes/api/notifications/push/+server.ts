/**
 * Browser push subscription for the logged-in player.
 * GET  /api/notifications/push
 * POST /api/notifications/push
 * DELETE /api/notifications/push
 */

import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireAuth } from '#lib/server/auth/permissions.js';
import {
  getVapidKeyPair,
  removePushSubscription,
  savePushSubscription,
} from '#lib/server/services/browserPush.js';

const httpsEndpoint = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Invalid push subscription');

const subscriptionSchema = z.object({
  endpoint: httpsEndpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

const endpointSchema = z.object({
  endpoint: httpsEndpoint,
});

function notConfigured() {
  return Response.json({ error: 'Computer notifications are not configured' }, { status: 503 });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals.user);
  const keys = getVapidKeyPair();
  return Response.json({
    success: true,
    data: { publicKey: keys?.publicKey ?? null },
  });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  requireAuth(locals.user);
  if (!getVapidKeyPair()) return notConfigured();

  const parsed = subscriptionSchema.safeParse(await readJson(request));
  if (!parsed.success || !parsed.data.endpoint.startsWith('https://')) {
    return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
  }

  await savePushSubscription(locals.user.steamId, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });

  return Response.json({ success: true });
};

export const DELETE: RequestHandler = async ({ locals, request }) => {
  requireAuth(locals.user);

  const parsed = endpointSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid push subscription' }, { status: 400 });
  }

  await removePushSubscription(locals.user.steamId, parsed.data.endpoint);
  return Response.json({ success: true });
};
