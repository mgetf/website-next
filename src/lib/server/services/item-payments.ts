import { notFound, badRequest } from '$lib/server/utils/errors';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import type { CheckoutTeamSelection } from '$lib/types/checkout';
import type { ItemPaymentOrderRow, ItemPaymentOrderStatus } from '$lib/types/service-models';

const ITEM_ORDER_EXPIRY_MS = 30 * 60 * 1000;

export async function expireOverdueOrders(): Promise<number> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return 0;
  throw new Error('expireOverdueOrders requires DATA_BACKEND=rama');
}

export type ItemPaymentOrderRecord = {
  orderNumber: string;
  itemName: string;
  itemsRequired: number;
  expiresAt: Date;
  checkoutTeams?: CheckoutTeamSelection[] | null;
};

export async function createItemPaymentOrder(
  steamId: string,
  teamId: number,
  paidForSteamIds: string[],
): Promise<ItemPaymentOrderRecord> {
  void steamId;
  void teamId;
  void paidForSteamIds;
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    badRequest('Item payments are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('createItemPaymentOrder requires DATA_BACKEND=rama');
}

/**
 * Find any pending item payment order for a user (used by multi-team checkout).
 */
export async function getPendingOrderForUser(
  steamId: string,
): Promise<ItemPaymentOrderRecord | null> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void steamId;
    return null;
  }
  throw new Error('getPendingOrderForUser requires DATA_BACKEND=rama');
}

/**
 * Create a single item payment order covering multiple teams.
 * All teams must share the same item type and app ID.
 */
export async function createMultiTeamItemOrder(
  steamId: string,
  teams: CheckoutTeamSelection[],
): Promise<ItemPaymentOrderRecord> {
  void steamId;
  void teams;
  throw new Error('createMultiTeamItemOrder is not available under Rama');
}

export async function cancelItemPaymentOrder(orderNumber: string, steamId: string) {
  return false;
}

export async function getPendingOrderBySteamId(steamId: string) {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void steamId;
    return null;
  }
  throw new Error('getPendingOrderBySteamId requires DATA_BACKEND=rama');
}

export async function confirmItemPayment(data: {
  orderNumber: string;
  tradeOfferId: string;
  itemsReceived: number;
  senderSteamId: string;
}) {
  throw new Error('confirmItemPayment is not available under Rama');
}

export async function getItemPaymentOrders(options: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ orders: ItemPaymentOrderRow[]; total: number; totalPages: number }> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void options;
    return { orders: [], total: 0, totalPages: 0 };
  }
  throw new Error('getItemPaymentOrders requires DATA_BACKEND=rama');
}

export async function adminCancelItemPaymentOrder(orderNumber: string) {
  throw new Error('adminCancelItemPaymentOrder is not available under Rama');
}

export async function getOrderStatus(orderNumber: string): Promise<ItemPaymentOrderStatus | null> {
  void orderNumber;
  return null;
}
