import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { getStaffPlayerChat, parseChatWindow } from '#lib/server/services/playerChat.js';
import { chatHistoryRateLimiter, checkRateLimit } from '#lib/server/utils/rateLimit.js';

export const GET: RequestHandler = async ({ locals, params, url }) => {
  requireAdmin(locals.user);

  const { allowed, response } = checkRateLimit(chatHistoryRateLimiter, locals.user.steamId);
  if (!allowed) return response!;

  const window = parseChatWindow(url.searchParams.get('days'));
  if (!window) return Response.json({ error: 'invalid days' }, { status: 400 });

  const region = url.searchParams.get('region')?.trim() ?? '';
  if (region && !/^[a-z0-9_-]{1,16}$/i.test(region) && region !== 'all') {
    return Response.json({ error: 'invalid region' }, { status: 400 });
  }

  const cursorRaw = url.searchParams.get('cursor');
  let cursor: number | undefined;
  if (cursorRaw) {
    if (!/^\d+$/.test(cursorRaw))
      return Response.json({ error: 'invalid cursor' }, { status: 400 });
    cursor = Number(cursorRaw);
  }

  const page = await getStaffPlayerChat(params.steamId, { region, window, cursor });
  if (!page) return Response.json({ error: 'Failed to load chat' }, { status: 502 });
  return Response.json(page);
};
