import type { PageServerLoad, Actions } from './$types';
import { requireAuth, isBanned } from '$lib/server/auth/permissions';
import { getAllUnpaidParticipations } from '$lib/server/services/payments';
import { isPayPalTestMode, getPayPalConfig } from '$lib/server/services/paypal';
import { getGlobalSettings } from '$lib/server/services/settings';
import {
  createItemPaymentOrder,
  createMultiTeamItemOrder,
  cancelItemPaymentOrder,
  getPendingOrderForUser,
} from '$lib/server/services/item-payments';
import { fetchSteamProfile } from '$lib/server/services/users';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { redirect, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { logPrismaError } from '$lib/server/utils/prisma-errors';
import type { CheckoutTeamSelection } from '$lib/types/checkout';

const createItemOrderSchema = z.object({
  teams: z.string().min(1, 'Missing teams'),
});

const cancelItemOrderSchema = z.object({
  orderNumber: z.string().min(1, 'Missing order number'),
});

export const load: PageServerLoad = async ({ params, locals }) => {
  requireAuth(locals.user);

  const steamId = params.steamId;

  if (steamId !== locals.user.steamId || isBanned(locals.user)) {
    throw redirect(303, '/');
  }

  const participations = await getAllUnpaidParticipations(steamId);

  if (participations.length === 0) {
    return {
      steamId,
      participations: [],
      paypalClientId: '',
      isTestMode: false,
      botTradeOfferUrl: null,
      botProfile: null,
      pendingItemOrder: null,
    };
  }

  const [globalSettings, paypalConfig] = await Promise.all([
    getGlobalSettings(),
    Promise.resolve(getPayPalConfig()),
  ]);

  const paypalClientId = paypalConfig.clientId;
  const isTestMode = isPayPalTestMode();

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
    participations,
    paypalClientId,
    isTestMode,
    botTradeOfferUrl: globalSettings?.botTradeOfferUrl ?? null,
    botProfile,
    pendingItemOrder: pendingItemOrder
      ? {
          orderNumber: pendingItemOrder.orderNumber,
          itemName: pendingItemOrder.itemName,
          itemsRequired: pendingItemOrder.itemsRequired,
          expiresAt: pendingItemOrder.expiresAt,
          checkoutTeams: pendingItemOrder.checkoutTeams,
        }
      : null,
  };
};

export const actions: Actions = {
  createItemOrder: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const validation = validateForm(formData, createItemOrderSchema);
    if (!validation.success) return validationError(validation.errors);

    const teams = JSON.parse(validation.data.teams) as CheckoutTeamSelection[];

    if (!Array.isArray(teams) || teams.length === 0) {
      return fail(400, { error: 'Invalid teams selection' });
    }

    try {
      let order: {
        orderNumber: string;
        itemName: string;
        itemsRequired: number;
        expiresAt: Date;
      };

      if (teams.length === 1) {
        const single = teams[0]!;
        const paidForSteamIds =
          single.paidForSteamIds.length > 0 ? single.paidForSteamIds : [locals.user!.steamId];
        order = await createItemPaymentOrder(locals.user!.steamId, single.teamId, paidForSteamIds);
      } else {
        order = await createMultiTeamItemOrder(locals.user!.steamId, teams);
      }

      await logAudit({
        actorId: locals.user!.steamId,
        actorRole: locals.user!.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CREATED,
        targetType: 'Team',
        targetId: teams.map((t) => String(t.teamId)).join(','),
        metadata: {
          orderNumber: order.orderNumber,
          teams,
          itemName: order.itemName,
          itemsRequired: order.itemsRequired,
        },
        ipAddress: getClientAddress(),
      });

      return {
        success: true,
        order: {
          orderNumber: order.orderNumber,
          itemName: order.itemName,
          itemsRequired: order.itemsRequired,
          expiresAt: order.expiresAt.toISOString(),
        },
      };
    } catch (err) {
      logPrismaError('checkout.actions.createItemOrder', err, {
        teams,
        actorSteamId: locals.user?.steamId ?? null,
      });
      console.error('Error creating item order:', err);
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

    const { orderNumber } = validation.data;

    try {
      await cancelItemPaymentOrder(orderNumber, locals.user!.steamId);

      await logAudit({
        actorId: locals.user!.steamId,
        actorRole: locals.user!.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CANCELLED,
        targetType: 'ItemPaymentOrder',
        targetId: orderNumber,
        metadata: { orderNumber },
        ipAddress: getClientAddress(),
      });

      return { success: true, message: 'Order cancelled' };
    } catch (err) {
      logPrismaError('checkout.actions.cancelItemOrder', err, {
        orderNumber,
        actorSteamId: locals.user?.steamId ?? null,
      });
      console.error('Error cancelling item order:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to cancel order',
      });
    }
  },
};
