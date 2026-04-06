import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireApiKey } from '$lib/server/auth/apiKey';
import { expireOverdueOrders } from '$lib/server/services/item-payments';

export const POST: RequestHandler = async ({ request }) => {
  await requireApiKey(request);

  const expiredCount = await expireOverdueOrders();

  return json({
    success: true,
    expiredCount,
  });
};
