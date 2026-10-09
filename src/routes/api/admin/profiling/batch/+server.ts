import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { getPlayerProfilingBatch } from '#lib/server/services/profiling.js';
import { isSteamId64 } from '#lib/utils/steamid.js';

const batchSchema = z.object({
  steamIds: z.array(z.string()).max(200),
});

export const POST: RequestHandler = async ({ locals, request }) => {
  requireAdmin(locals.user);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid Steam ID list' }, { status: 400 });
  }

  const steamIds = parsed.data.steamIds.filter((id) => isSteamId64(id));
  const snapshots = await getPlayerProfilingBatch(steamIds);
  return Response.json({ success: true, data: snapshots });
};
