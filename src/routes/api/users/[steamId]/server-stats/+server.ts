import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getEnrichedPlayerServerStats,
  isPlayerServerStatsWarm,
} from '$lib/server/services/playerStats';
import { checkRateLimit, serverStatsRateLimiter } from '$lib/server/utils/rateLimit';

export const GET: RequestHandler = async ({ params, url, getClientAddress }) => {
  const region = url.searchParams.get('region') ?? '';
  if (!region) {
    return json({ error: 'region is required' }, { status: 400 });
  }

  const query = {
    region,
    days: url.searchParams.get('days') ?? 'all',
    tz: url.searchParams.get('tz') ?? undefined,
  };

  if (!isPlayerServerStatsWarm(params.steamId, query)) {
    const { allowed, response } = checkRateLimit(serverStatsRateLimiter, getClientAddress());
    if (!allowed) return response!;
  }

  const stats = await getEnrichedPlayerServerStats(params.steamId, query);

  if (!stats) {
    return json({ error: 'Failed to load server stats' }, { status: 502 });
  }

  return json(stats);
};
