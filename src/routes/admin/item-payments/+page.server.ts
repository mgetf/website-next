import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { requireAdmin } from '$lib/server/auth/permissions';
import {
  getItemPaymentOrders,
  adminCancelItemPaymentOrder,
  expireOverdueOrders,
} from '$lib/server/services/item-payments';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import type { PageServerLoad, Actions } from './$types';

const orderNumberSchema = z.object({
  orderNumber: z.string().min(1, 'Missing order number'),
});

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals.user);

  await expireOverdueOrders();

  const status = url.searchParams.get('status') || 'ALL';
  const pageParam = url.searchParams.get('page');
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10) || 1) : 1;

  const { orders, total, totalPages } = await getItemPaymentOrders({
    status,
    page: currentPage,
    limit: 25,
  });

  return {
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      playerSteamId: o.playerSteamId,
      playerName: o.player.steamUsername,
      teamId: o.team.id,
      teamName: o.team.name,
      itemName: o.itemName,
      itemsRequired: o.itemsRequired,
      itemsReceived: o.itemsReceived,
      status: o.status,
      tradeOfferId: o.tradeOfferId,
      createdAt: o.createdAt.toISOString(),
      expiresAt: o.expiresAt.toISOString(),
      completedAt: o.completedAt?.toISOString() ?? null,
    })),
    total,
    totalPages,
    currentPage,
    statusFilter: status,
  };
};

export const actions: Actions = {
  cancelOrder: async ({ request, locals, getClientAddress }) => {
    requireAdmin(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, orderNumberSchema);
    if (!validation.success) return validationError(validation.errors);

    const { orderNumber } = validation.data;

    try {
      await adminCancelItemPaymentOrder(orderNumber);

      await logAudit({
        actorId: locals.user!.steamId,
        actorRole: locals.user!.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CANCELLED,
        targetType: 'ItemPaymentOrder',
        targetId: orderNumber,
        metadata: { orderNumber, cancelledByAdmin: true },
        ipAddress: getClientAddress(),
      });

      return { success: true };
    } catch (err) {
      console.error('Error cancelling item order:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to cancel order',
      });
    }
  },
};
