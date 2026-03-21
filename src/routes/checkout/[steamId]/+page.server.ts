import type { PageServerLoad, Actions } from './$types';
import { requireAuth, isBanned } from '$lib/server/auth/permissions';
import {
  getUserActiveTeamForCheckout,
  getExistingPayment,
  updatePlayerPaymentStatus,
  getLeagueFees,
} from '$lib/server/services/payments';
import { isPayPalTestMode } from '$lib/server/services/paypal';
import { getGlobalSettings } from '$lib/server/services/settings';
import { getItemPaymentByDivisionId } from '$lib/server/services/division-item-payments';
import {
  createItemPaymentOrder,
  cancelItemPaymentOrder,
  expireOverdueOrders,
  getPendingOrderForCheckout,
} from '$lib/server/services/item-payments';
import { fetchSteamProfile } from '$lib/server/services/users';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { redirect, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAuth(locals.user);

  const steamId = params.steamId;

  if (steamId !== locals.user.steamId || isBanned(locals.user)) {
    throw redirect(303, '/');
  }

  const teamIdParam = url.searchParams.get('teamId');
  const teamId = teamIdParam ? parseInt(teamIdParam, 10) : undefined;

  const playerInTeam = await getUserActiveTeamForCheckout(steamId, teamId);

  if (!playerInTeam || !playerInTeam.team) {
    throw redirect(303, '/');
  }

  const team = playerInTeam.team;
  const division = team.division;

  if (!division) {
    throw redirect(303, `/teams/${team.id}`);
  }

  if (division.signupCost === 0) {
    throw redirect(303, `/teams/${team.id}`);
  }

  if (playerInTeam.paymentStatus === 1) {
    throw redirect(303, `/teams/${team.id}`);
  }

  const [existingPayment, leagueFees, globalSettings, itemPaymentConfig] = await Promise.all([
    team.seasonId ? getExistingPayment(steamId, team.seasonId) : null,
    getLeagueFees(),
    getGlobalSettings(),
    getItemPaymentByDivisionId(division.id),
  ]);

  const amountPaid = existingPayment?.amount || 0;
  const isFirstPayment = amountPaid === 0;

  const effectiveLeagueFees = isFirstPayment ? leagueFees : 0;
  const totalAmount = division.signupCost + effectiveLeagueFees;

  if (amountPaid >= totalAmount) {
    await updatePlayerPaymentStatus(steamId, team.id);
    throw redirect(303, `/teams/${team.id}`);
  }

  const currency = team.region?.currencyCode ?? 'USD';
  const currencySymbol = team.region?.currencySymbol ?? '$';

  const paypalClientId = process.env.PAYPAL_CLIENT_ID || '';
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

  let pendingItemOrder: {
    orderNumber: string;
    itemName: string;
    itemsRequired: number;
    expiresAt: string;
  } | null = null;

  if (itemPaymentConfig) {
    await expireOverdueOrders();
    pendingItemOrder = await getPendingOrderForCheckout(steamId, team.id);
  }

  return {
    team,
    division,
    signupCost: division.signupCost,
    leagueFees: effectiveLeagueFees,
    totalAmount,
    amountPaid,
    isFirstPayment,
    currency,
    currencySymbol,
    steamId,
    paypalClientId,
    isTestMode,
    itemPaymentConfig: itemPaymentConfig
      ? {
          itemName: itemPaymentConfig.steamItem.name,
          itemQuantity: itemPaymentConfig.itemQuantity,
          itemAppId: itemPaymentConfig.steamItem.appId,
        }
      : null,
    botTradeOfferUrl: globalSettings?.botTradeOfferUrl ?? null,
    botProfile,
    pendingItemOrder,
  };
};

export const actions: Actions = {
  createItemOrder: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const teamId = parseInt(formData.get('teamId') as string);

    if (!teamId || isNaN(teamId)) {
      return fail(400, { error: 'Invalid team ID' });
    }

    try {
      const order = await createItemPaymentOrder(locals.user!.steamId, teamId);

      await logAudit({
        actorId: locals.user!.steamId,
        actorRole: locals.user!.permissionLevel,
        category: AuditCategory.PAYMENT,
        action: AuditAction.ITEM_ORDER_CREATED,
        targetType: 'Team',
        targetId: String(teamId),
        metadata: {
          orderNumber: order.orderNumber,
          teamId,
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
      console.error('Error creating item order:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to create item payment order',
      });
    }
  },

  cancelItemOrder: async ({ request, locals, getClientAddress }) => {
    requireAuth(locals.user);

    const formData = await request.formData();
    const orderNumber = formData.get('orderNumber') as string;

    if (!orderNumber) {
      return fail(400, { error: 'Missing order number' });
    }

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
      console.error('Error cancelling item order:', err);
      return fail(400, {
        error: err instanceof Error ? err.message : 'Failed to cancel order',
      });
    }
  },
};
