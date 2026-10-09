import type { RequestHandler } from './$types';

import { requireAuth } from '#lib/server/auth/permissions.js';
import { getOrderStatus } from '#lib/server/services/item-payments.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals.user);

  const { orderNumber } = params;

  if (!orderNumber) {
    return Response.json({ error: 'Missing orderNumber' }, { status: 400 });
  }

  const order = await getOrderStatus(orderNumber);

  if (!order) {
    return Response.json({ error: 'Order not found' }, { status: 404 });
  }

  if (order.playerSteamId !== locals.user!.steamId) {
    return Response.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return Response.json({
    status: order.status,
    orderNumber: order.orderNumber,
    completedAt: order.completedAt?.toISOString() ?? null,
  });
};
