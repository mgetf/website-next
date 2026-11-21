/**
 * POST /api/v1/bot/outbox/:id/ack
 *
 * The bot reports what happened to a claimed message.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Body:      { result: 'delivered' | 'retry' | 'dead', error?: string }
 * Responses:
 *   200 { ok: true }
 *   400  Bad id or body
 *   401  Missing or invalid API key
 *   409  The message is not claimed (already acked, or the lease ran out)
 */

import type { RequestHandler } from './$types';

import { z } from 'zod';
import { requireApiKey } from '#lib/server/auth/apiKey.js';
import { ackOutboxEvent } from '#lib/server/services/outbox.js';

const ackSchema = z.object({
  result: z.enum(['delivered', 'retry', 'dead']),
  error: z.string().optional(),
  /** The Discord message that was sent, so a reply to it can be tied back. */
  messageId: z
    .string()
    .regex(/^\d{5,25}$/)
    .optional(),
});

export const POST: RequestHandler = async ({ params, request }) => {
  await requireApiKey(request);

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Invalid id' }, { status: 400 });
  }

  const parsed = ackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const acked = await ackOutboxEvent(
    id,
    parsed.data.result,
    parsed.data.error,
    parsed.data.messageId,
  );
  if (!acked) {
    return Response.json({ error: 'Event is not claimed' }, { status: 409 });
  }
  return Response.json({ ok: true });
};
