/**
 * POST /api/v1/bot/outbox/claim
 *
 * The Discord bot polls this for messages to send. Each call also confirms any
 * score reports whose 24 hour deadline passed, so the bot's poll is the clock.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Body:      { limit?: number }   (1-50, default 20)
 * Responses:
 *   200 { events: [{ id, kind, attempts, payload }] }
 *   401  Missing or invalid API key
 */

import type { RequestHandler } from './$types';

import { requireApiKey } from '#lib/server/auth/apiKey.js';
import { autoConfirmDueSubmissions } from '#lib/server/services/matches.js';
import { claimOutboxEvents } from '#lib/server/services/outbox.js';

export const POST: RequestHandler = async ({ request }) => {
  await requireApiKey(request);

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  const limit = typeof body.limit === 'number' ? body.limit : 20;

  try {
    await autoConfirmDueSubmissions();
  } catch (err) {
    console.error('[outbox] auto-confirm sweep failed:', err);
  }

  const events = await claimOutboxEvents(limit);
  return Response.json({ events });
};
