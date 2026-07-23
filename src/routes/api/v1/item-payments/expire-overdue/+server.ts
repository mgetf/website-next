import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { expireOverdueOrders } from '$lib/server/services/item-payments';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const expiredCount = await expireOverdueOrders();

  return json({
    success: true,
    expiredCount,
  });
};
