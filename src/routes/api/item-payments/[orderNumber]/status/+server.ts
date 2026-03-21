import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/permissions';
import { getOrderStatus } from '$lib/server/services/item-payments';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals.user);

  const { orderNumber } = params;

  if (!orderNumber) {
    return json({ error: 'Missing orderNumber' }, { status: 400 });
  }

  const order = await getOrderStatus(orderNumber);

  if (!order) {
    return json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.playerSteamId !== locals.user!.steamId) {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  return json({
    status: order.status,
    orderNumber: order.orderNumber,
    completedAt: order.completedAt?.toISOString() ?? null,
  });
};
