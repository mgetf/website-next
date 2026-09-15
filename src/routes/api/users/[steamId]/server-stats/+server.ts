import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnrichedPlayerServerStats } from '$lib/server/services/playerStats';

export const GET: RequestHandler = async ({ params, url }) => {
  const region = url.searchParams.get('region') ?? '';
  if (!region) {
    return json({ error: 'region is required' }, { status: 400 });
  }

  const stats = await getEnrichedPlayerServerStats(params.steamId, {
    region,
    days: url.searchParams.get('days') ?? 'all',
    tz: url.searchParams.get('tz') ?? undefined,
  });

  if (!stats) {
    return json({ error: 'Failed to load server stats' }, { status: 502 });
  }

  return json(stats);
};
