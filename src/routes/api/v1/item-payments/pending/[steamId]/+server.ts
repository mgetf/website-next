import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { getPendingOrderBySteamId, expireOverdueOrders } from '$lib/server/services/item-payments';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { steamId } = params;

  if (!steamId) {
    return json({ error: 'Missing steamId' }, { status: 400 });
  }

  await expireOverdueOrders();

  const order = await getPendingOrderBySteamId(steamId);

  return json({
    hasPending: !!order,
    order: order ?? undefined,
  });
};
