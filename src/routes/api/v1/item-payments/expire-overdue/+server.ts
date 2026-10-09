import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { expireOverdueOrders } from '#lib/server/services/item-payments.js';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const expiredCount = await expireOverdueOrders();

  return Response.json({
    success: true,
    expiredCount,
  });
};
