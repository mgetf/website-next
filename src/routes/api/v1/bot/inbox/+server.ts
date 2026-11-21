/**
 * POST /api/v1/bot/inbox
 *
 * The Discord bot forwards a direct message someone sent it. Shown to admins
 * on the Discord tab. Repeating the same message is harmless.
 * Requires a valid API key in the Authorization: Bearer header.
 *
 * Body:      { discordMessageId, discordUserId, discordUsername, content,
 *              attachments?: [{ name, url }], replyToMessageId? }
 * Responses:
 *   200 { ok: true, created: boolean }
 *   400  Bad body
 *   401  Missing or invalid API key
 */

import type { RequestHandler } from './$types';

import { z } from 'zod';
import { requireApiKey } from '#lib/server/auth/apiKey.js';
import { recordInboxMessage } from '#lib/server/services/discordAdmin.js';

const snowflake = z.string().regex(/^\d{5,25}$/);

const inboxSchema = z.object({
  discordMessageId: snowflake,
  discordUserId: snowflake,
  discordUsername: z.string().min(1).max(100),
  content: z.string().max(10_000),
  attachments: z
    .array(z.object({ name: z.string().max(200), url: z.string().url().max(2000) }))
    .max(10)
    .optional(),
  replyToMessageId: snowflake.nullish(),
});

export const POST: RequestHandler = async ({ request }) => {
  await requireApiKey(request);

  const parsed = inboxSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { created } = await recordInboxMessage(parsed.data);
  return Response.json({ ok: true, created });
};
