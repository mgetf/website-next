import type { Actions, PageServerLoad } from './$types';
import { requireAuth, isBanned, requireNotBanned } from '#lib/server/auth/permissions.js';
import { isPayPalTestMode, getPayPalConfig } from '#lib/server/services/paypal.js';
import { getGlobalSettings } from '#lib/server/services/settings.js';
import {
  createCartItemOrders,
  cancelItemPaymentOrder,
  getPendingOrderForUser,
} from '#lib/server/services/item-payments.js';
import {
  addToCart,
  addUnpaidTeamToCart,
  getCartQuote,
  releaseCartReservations,
  removeFromCart,
  reserveCartLines,
} from '#lib/server/services/cart.js';
import { fetchSteamProfile } from '#lib/server/services/users.js';
import { logAudit, AuditCategory, AuditAction } from '#lib/server/services/auditLog.js';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError, formError, formSuccess } from '#lib/server/utils/forms.js';
import { logPrismaError } from '#lib/server/utils/prisma-errors.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

const addSchema = z.object({
  teamId: z.coerce.number().int().positive(),
  playerSteamId: z.string().min(1),
});

const addTeamSchema = z.object({
  teamId: z.coerce.number().int().positive(),
});

const removeSchema = z.object({
  lineId: z.coerce.number().int().positive(),
});

const createItemOrderSchema = z.object({
  lineIds: z.string().min(1, 'Missing cart items'),
});

const cancelItemOrderSchema = z.object({
  orderNumber: z.string().min(1, 'Missing order number'),
});

export const load: PageServerLoad = async ({ locals, url }) => {
  requireAuth(locals.user);

  if (isBanned(locals.user)) {
    throw redirect(303, '/');
  }

  const steamId = locals.user.steamId;
  const lines = await getCartQuote(steamId);

  const [globalSettings, paypalConfig] = await Promise.all([
    getGlobalSettings(),
    Promise.resolve(getPayPalConfig()),
  ]);

  let botProfile: { steamId: string; name: string; avatar: string; profileUrl: string } | null =
    null;
  if (globalSettings?.botSteamId) {
    const profile = await fetchSteamProfile(globalSettings.botSteamId);
    if (profile) {
      botProfile = {
        steamId: globalSettings.botSteamId,
        name: profile.personaname,
        avatar: profile.avatarfull,
        profileUrl: `https://steamcommunity.com/profiles/${globalSettings.botSteamId}`,
      };
    }
  }

  const pendingItemOrder = await getPendingOrderForUser(steamId);

  return {
    steamId,
    lines,
    paymentSuccess: url.searchParams.get('payment') === 'success',
    paypalClientId: paypalConfig.clientId,
    isTestMode: isPayPalTestMode(),
    botTradeOfferUrl: globalSettings?.botTradeOfferUrl ?? null,
    botProfile,
    pendingItemOrder: pendingItemOrder
      ? {
          orderNumber: pendingItemOrder.orderNumber,
          itemName: pendingItemOrder.itemName,
          itemsRequired: pendingItemOrder.itemsRequired,
          expiresAt: pendingItemOrder.expiresAt,
        }
      : null,
  };
};

export const actions: Actions = {
  add: async ({ request, locals }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, addSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await addToCart(locals.user.steamId, validation.data.teamId, validation.data.playerSteamId);
    } catch (err) {
      return formError(getErrorMessage(err, 'Could not add that player to the cart'));
    }

    throw redirect(303, '/checkout');
  },

  addTeam: async ({ request, locals }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, addTeamSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await addUnpaidTeamToCart(locals.user.steamId, validation.data.teamId);
    } catch (err) {
      return formError(getErrorMessage(err, 'Could not add those players to the cart'));
    }

    throw redirect(303, '/checkout');
  },

  remove: async ({ request, locals }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, removeSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await removeFromCart(locals.user.steamId, validation.data.lineId);
      return formSuccess(undefined, 'Removed from cart');
    } catch (err) {
      return formError(getErrorMessage(err, 'Could not remove that cart item'));
    }
  },

  createItemOrder: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);
    requireNotBanned(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createItemOrderSchema);
    if (!validation.success) return validationError(validation.errors);

    let lineIds: number[];
    try {
      lineIds = (JSON.parse(validation.data.lineIds) as unknown[])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
    } catch {
      return fail(400, { error: 'Invalid cart selection' });
    }

    try {
      const quoted = await reserveCartLines(locals.user.steamId, lineIds);
      const order = await createCartItemOrders(locals.user.steamId, quoted);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CREATED,
        targetType: 'ItemPaymentOrder',
        targetId: order.orders.map((row) => row.orderNumber).join(','),
        metadata: {
          checkoutGroupId: order.checkoutGroupId,
          itemName: order.itemName,
          itemsRequired: order.itemsRequired,
        },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        order: {
          orderNumber: order.orders[0]!.orderNumber,
          itemName: order.itemName,
          itemsRequired: order.itemsRequired,
          expiresAt: order.expiresAt.toISOString(),
        },
      };
    } catch (err) {
      await releaseCartReservations(locals.user.steamId);
      logPrismaError('checkout.actions.createItemOrder', err, {
        lineIds,
        actorSteamId: locals.user.steamId,
      });
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to create item payment order',
      });
    }
  },

  cancelItemOrder: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, cancelItemOrderSchema);
    if (!validation.success) return validationError(validation.errors);

    try {
      await cancelItemPaymentOrder(validation.data.orderNumber, locals.user.steamId);
      await releaseCartReservations(locals.user.steamId);

      await logAudit({
        actorId: locals.user.steamId,
        actorRole: locals.user.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CANCELLED,
        targetType: 'ItemPaymentOrder',
        targetId: validation.data.orderNumber,
        metadata: { orderNumber: validation.data.orderNumber },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Order cancelled' };
    } catch (err) {
      logPrismaError('checkout.actions.cancelItemOrder', err, {
        orderNumber: validation.data.orderNumber,
        actorSteamId: locals.user.steamId,
      });
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to cancel order',
      });
    }
  },
};
