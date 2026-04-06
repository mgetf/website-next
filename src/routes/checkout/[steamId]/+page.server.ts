import type { PageServerLoad, Actions } from './$types';
import { requireAuth, isBanned } from '$lib/server/auth/permissions';
import { getUserActiveTeamForCheckout, getTeamUnpaidPlayers } from '$lib/server/services/payments';
import { isPayPalTestMode, getPayPalConfig } from '$lib/server/services/paypal';
import { getGlobalSettings } from '$lib/server/services/settings';
import { getItemPaymentByDivisionId } from '$lib/server/services/division-item-payments';
import {
  createItemPaymentOrder,
  cancelItemPaymentOrder,
  getPendingOrderForCheckout,
} from '$lib/server/services/item-payments';
import { fetchSteamProfile } from '$lib/server/services/users';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import { redirect, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { validateForm, validationError } from '$lib/server/utils/forms';
import { logPrismaError } from '$lib/server/utils/prisma-errors';

const createItemOrderSchema = z.object({
  teamId: z.coerce.number().int().positive('Invalid team ID'),
  paidForSteamIds: z.string().optional().default(''),
});

const cancelItemOrderSchema = z.object({
  orderNumber: z.string().min(1, 'Missing order number'),
});

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
  const region = team.region;
  const season = team.season;
  const format = team.format;

  if (!division) {
    throw redirect(303, `/teams/${team.id}`);
  }

  if (division.signupCost === 0) {
    throw redirect(303, `/teams/${team.id}`);
  }

  if (!team.seasonId) {
    throw redirect(303, `/teams/${team.id}`);
  }

  const unpaidPlayers = await getTeamUnpaidPlayers(team.id, team.seasonId);

  if (unpaidPlayers.length === 0) {
    return {
      allPaid: true as const,
      team: { id: team.id, name: team.name, avatar: team.avatar },
      unpaidPlayers: [],
      division: { id: division.id, name: division.name },
      format: { name: format.name },
      region: region ? { name: region.name } : null,
      season: season ? { seasonNum: season.seasonNum } : null,
      currency: region?.currencyCode ?? 'USD',
      currencySymbol: region?.currencySymbol ?? '$',
      currentUserIsPaid: true,
      steamId,
      paypalClientId: '',
      isTestMode: false,
      itemPaymentConfig: null as {
        itemName: string;
        itemQuantity: number;
        itemAppId: number;
      } | null,
      botTradeOfferUrl: null as string | null,
      botProfile: null as {
        steamId: string;
        name: string;
        avatar: string;
        profileUrl: string;
      } | null,
      pendingItemOrder: null as {
        orderNumber: string;
        itemName: string;
        itemsRequired: number;
        expiresAt: string;
      } | null,
    };
  }

  const currentUserIsPaid = !unpaidPlayers.some((p) => p.steamId === steamId);

  const [globalSettings, itemPaymentConfig] = await Promise.all([
    getGlobalSettings(),
    getItemPaymentByDivisionId(division.id),
  ]);

  const paypalClientId = getPayPalConfig().clientId;
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
    pendingItemOrder = await getPendingOrderForCheckout(steamId, team.id);
  }

  return {
    allPaid: false as const,
    team: { id: team.id, name: team.name, avatar: team.avatar },
    unpaidPlayers,
    division: { id: division.id, name: division.name },
    format: { name: format.name },
    region: region ? { name: region.name } : null,
    season: season ? { seasonNum: season.seasonNum } : null,
    currency: region?.currencyCode ?? 'USD',
    currencySymbol: region?.currencySymbol ?? '$',
    currentUserIsPaid,
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
    const validation = validateForm(formData, createItemOrderSchema);
    if (!validation.success) return validationError(validation.errors);

    const { teamId, paidForSteamIds: paidForRaw } = validation.data;

    const paidForSteamIds = paidForRaw
      ? (JSON.parse(paidForRaw) as string[])
      : [locals.user!.steamId];

    try {
      const order = await createItemPaymentOrder(locals.user!.steamId, teamId, paidForSteamIds);

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
          paidForSteamIds,
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
        teamId,
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
