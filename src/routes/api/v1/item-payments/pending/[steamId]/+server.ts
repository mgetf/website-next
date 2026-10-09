import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import {
  getPendingOrderBySteamId,
  expireOverdueOrders,
} from '#lib/server/services/item-payments.js';

export const GET: RequestHandler = async ({ params, request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const { steamId } = params;

  if (!steamId) {
    return Response.json({ error: 'Missing steamId' }, { status: 400 });
  }

  await expireOverdueOrders();

  const order = await getPendingOrderBySteamId(steamId);

  return Response.json({
    hasPending: !!order,
    order: order ?? undefined,
  });
};
