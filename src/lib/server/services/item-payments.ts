import { prisma } from '#lib/server/db.js';
import { notFound, badRequest } from '#lib/server/utils/errors.js';
import { logAudit, AuditCategory, AuditAction } from '#lib/server/services/auditLog.js';
import {
  quoteParticipationLines,
  recordQuotedSignupPayments,
} from '#lib/server/services/payments.js';
import { finalizePaidCartLines } from '#lib/server/services/cart.js';
import type { QuotedParticipation } from '#lib/types/cart.js';
import type { CheckoutTeamSelection } from '#lib/types/checkout.js';
import { leaguePageHref } from '#lib/utils/leagueNav.js';
import { getRegionAbbr } from '#lib/utils/region.js';

const ITEM_ORDER_EXPIRY_MS = 30 * 60 * 1000;

export async function expireOverdueOrders(): Promise<number> {
  const overdueOrders = await prisma.itemPaymentOrder.findMany({
    where: {
      status: 'PENDING',
      expiresAt: { lt: new Date() },
    },
    select: { id: true, orderNumber: true, teamId: true },
  });

  if (overdueOrders.length === 0) return 0;

  await prisma.itemPaymentOrder.updateMany({
    where: { id: { in: overdueOrders.map((o) => o.id) } },
    data: { status: 'EXPIRED' },
  });

  for (const order of overdueOrders) {
    await logAudit({
      actorId: null,
      actorRole: null,
      category: AuditCategory.PAYMENT,
      action: AuditAction.ITEM_ORDER_EXPIRED,
      targetType: 'ItemPaymentOrder',
      targetId: order.orderNumber,
      metadata: { orderNumber: order.orderNumber, teamId: order.teamId },
    });
  }

  return overdueOrders.length;
}

/**
 * Find any pending item payment order for a user (used by multi-team checkout).
 */
export async function getPendingOrderForUser(steamId: string) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!order) return null;

  let itemsRequired = order.itemsRequired;
  if (order.checkoutGroupId) {
    const group = await prisma.itemPaymentOrder.findMany({
      where: { checkoutGroupId: order.checkoutGroupId, status: 'PENDING' },
      select: { itemsRequired: true },
    });
    itemsRequired = group.reduce((sum, row) => sum + row.itemsRequired, 0);
  }

  return {
    orderNumber: order.orderNumber,
    itemName: order.itemName,
    itemsRequired,
    expiresAt: order.expiresAt.toISOString(),
    checkoutTeams: order.checkoutTeams
      ? (JSON.parse(order.checkoutTeams) as CheckoutTeamSelection[])
      : null,
  };
}

export async function createCartItemOrders(payerSteamId: string, lines: QuotedParticipation[]) {
  if (lines.length === 0) badRequest('No cart items provided');

  const configs = lines.map((line) => line.itemPaymentConfig);
  if (configs.some((config) => !config)) {
    badRequest('One or more selected items cannot be paid with Steam items');
  }
  const reference = configs[0]!;
  if (
    configs.some(
      (config) =>
        config!.itemName !== reference.itemName || config!.itemAppId !== reference.itemAppId,
    )
  ) {
    badRequest('All selected items must use the same Steam item');
  }

  const existing = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: payerSteamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });
  if (existing) badRequest('You already have a pending item payment order');

  const firstTeam = await prisma.team.findUnique({
    where: { id: lines[0]!.teamId },
    include: {
      division: { include: { itemPayment: { include: { steamItem: true } } } },
    },
  });
  const steamItem = firstTeam?.division?.itemPayment?.steamItem;
  if (!steamItem) badRequest('This division does not accept item payments');

  const expiresAt = new Date(Date.now() + ITEM_ORDER_EXPIRY_MS);
  const checkoutGroupId = crypto.randomUUID();
  const checkoutTeamsJson = JSON.stringify(
    lines.map((line) => ({
      teamId: line.teamId,
      paidForSteamIds: [line.playerSteamId],
    })),
  );

  const created = await prisma.$transaction(async (tx) => {
    const orders = [];
    for (const line of lines) {
      const config = line.itemPaymentConfig!;
      const row = await tx.itemPaymentOrder.create({
        data: {
          orderNumber: 'IP-TEMP',
          playerSteamId: payerSteamId,
          teamId: line.teamId,
          seasonId: line.seasonId,
          itemName: steamItem.name,
          itemAppId: steamItem.appId,
          itemMarketHashName: steamItem.marketHashName,
          itemsRequired: config.itemQuantity,
          paidForSteamIds: [line.playerSteamId],
          checkoutTeams: checkoutTeamsJson,
          checkoutGroupId,
          expiresAt,
        },
      });
      const numbered = await tx.itemPaymentOrder.update({
        where: { id: row.id },
        data: { orderNumber: `IP-${row.id.toString().padStart(5, '0')}` },
      });
      orders.push(numbered);
    }
    return orders;
  });

  return {
    checkoutGroupId,
    orders: created,
    itemName: steamItem.name,
    itemsRequired: lines.reduce(
      (sum, line) => sum + (line.itemPaymentConfig?.itemQuantity ?? 0),
      0,
    ),
    expiresAt,
  };
}

export async function cancelItemPaymentOrder(orderNumber: string, steamId: string) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: {
      orderNumber,
      playerSteamId: steamId,
      status: 'PENDING',
    },
  });

  if (!order) {
    notFound('Pending order not found');
  }

  if (order.checkoutGroupId) {
    await prisma.itemPaymentOrder.updateMany({
      where: { checkoutGroupId: order.checkoutGroupId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    return order;
  }

  return await prisma.itemPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'CANCELLED' },
  });
}

export type ItemPaymentDisplayPlayer = {
  steamId: string;
  name: string;
};

export type ItemPaymentDisplaySpot = {
  seasonLabel: string;
  leaguePath: string;
  teamName: string | null;
  teamPath: string | null;
  itemCount: number;
  moneyLabel: string | null;
  players: ItemPaymentDisplayPlayer[];
};

export type ItemPaymentDisplay = {
  payer: ItemPaymentDisplayPlayer;
  itemName: string;
  moneyLabel: string | null;
  spots: ItemPaymentDisplaySpot[];
};

type DisplayTeam = {
  id: number;
  name: string;
  isIndividual: boolean;
  signupCost: number;
  itemQuantity: number | null;
  season: {
    id: number;
    seasonNum: number;
    regionId: number;
    regionName: string;
    currencySymbol: string;
    formatCode: string;
    formatName: string;
  } | null;
};

function formatMoney(symbol: string, amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `${symbol}${text}`;
}

function coveredSteamIds(paidForSteamIds: string[] | undefined, payerSteamId: string): string[] {
  const ids = paidForSteamIds && paidForSteamIds.length > 0 ? paidForSteamIds : [payerSteamId];
  return [...new Set(ids)];
}

export function buildItemPaymentDisplay(input: {
  payer: ItemPaymentDisplayPlayer;
  itemName: string;
  selections: CheckoutTeamSelection[];
  teams: DisplayTeam[];
  names: ReadonlyMap<string, string>;
}): ItemPaymentDisplay {
  const teamsById = new Map(input.teams.map((team) => [team.id, team]));
  const spots: ItemPaymentDisplaySpot[] = [];
  const moneyParts: { symbol: string; amount: number }[] = [];

  for (const selection of input.selections) {
    const team = teamsById.get(selection.teamId);
    if (!team) continue;

    const playerIds = coveredSteamIds(selection.paidForSteamIds, input.payer.steamId);
    const players = playerIds.map((steamId) => ({
      steamId,
      name: input.names.get(steamId) ?? 'Unknown player',
    }));
    const itemCount =
      team.itemQuantity != null && team.itemQuantity > 0 ? team.itemQuantity * players.length : 0;
    const moneyAmount = team.signupCost > 0 ? team.signupCost * players.length : 0;
    const moneyLabel =
      team.season && moneyAmount > 0 ? formatMoney(team.season.currencySymbol, moneyAmount) : null;

    if (team.season && moneyAmount > 0) {
      moneyParts.push({ symbol: team.season.currencySymbol, amount: moneyAmount });
    }

    const season = team.season;
    const abbr = season ? getRegionAbbr(season.regionName) : '';
    spots.push({
      seasonLabel: season
        ? `${abbr || season.regionName} ${season.formatName} Season ${season.seasonNum}`
        : 'a league signup',
      leaguePath: season
        ? leaguePageHref(season.formatCode, season.id, season.regionId)
        : '/leagues',
      teamName: team.isIndividual ? null : team.name,
      teamPath: team.isIndividual ? null : `/teams/${team.id}`,
      itemCount,
      moneyLabel,
      players,
    });
  }

  const sameSymbol = moneyParts.every((part) => part.symbol === moneyParts[0]?.symbol);
  const moneyTotal = moneyParts.reduce((sum, part) => sum + part.amount, 0);

  return {
    payer: input.payer,
    itemName: input.itemName,
    moneyLabel:
      moneyParts.length > 0 && sameSymbol && moneyParts[0]
        ? formatMoney(moneyParts[0].symbol, moneyTotal)
        : null,
    spots,
  };
}

function parseCheckoutSelections(
  raw: string | null,
  teamId: number,
  paidForSteamIds: string[],
): CheckoutTeamSelection[] {
  if (!raw) return [{ teamId, paidForSteamIds }];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ teamId, paidForSteamIds }];
    }
    const selections = parsed.flatMap((entry) => {
      if (entry == null || typeof entry !== 'object') return [];
      const teamIdValue = (entry as { teamId?: unknown }).teamId;
      const paidFor = (entry as { paidForSteamIds?: unknown }).paidForSteamIds;
      if (!Number.isInteger(teamIdValue)) return [];
      const paidForIds = Array.isArray(paidFor)
        ? paidFor.filter((id): id is string => typeof id === 'string')
        : [];
      return [{ teamId: teamIdValue as number, paidForSteamIds: paidForIds }];
    });
    return selections.length > 0 ? selections : [{ teamId, paidForSteamIds }];
  } catch {
    return [{ teamId, paidForSteamIds }];
  }
}

export async function getPendingOrderBySteamId(steamId: string) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    include: {
      player: { select: { steamId: true, steamUsername: true } },
    },
  });

  if (!order) return null;

  const selections = parseCheckoutSelections(
    order.checkoutTeams,
    order.teamId,
    order.paidForSteamIds,
  );
  const teamIds = [...new Set(selections.map((selection) => selection.teamId))];
  const teamRows = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: {
      id: true,
      name: true,
      format: { select: { isIndividual: true } },
      division: {
        select: {
          signupCost: true,
          itemPayment: { select: { itemQuantity: true } },
        },
      },
      season: {
        select: {
          id: true,
          seasonNum: true,
          regionId: true,
          region: { select: { name: true, currencySymbol: true } },
          format: { select: { code: true, name: true } },
        },
      },
    },
  });

  const coveredIds = [
    ...new Set(
      selections.flatMap((selection) => coveredSteamIds(selection.paidForSteamIds, steamId)),
    ),
  ];
  const namedPlayers = await prisma.user.findMany({
    where: { steamId: { in: coveredIds } },
    select: { steamId: true, steamUsername: true },
  });
  const names = new Map(namedPlayers.map((player) => [player.steamId, player.steamUsername]));

  const display = buildItemPaymentDisplay({
    payer: { steamId: order.player.steamId, name: order.player.steamUsername },
    itemName: order.itemName,
    selections,
    teams: teamRows.map((team) => ({
      id: team.id,
      name: team.name,
      isIndividual: team.format.isIndividual,
      signupCost: team.division?.signupCost ?? 0,
      itemQuantity: team.division?.itemPayment?.itemQuantity ?? null,
      season: team.season
        ? {
            id: team.season.id,
            seasonNum: team.season.seasonNum,
            regionId: team.season.regionId,
            regionName: team.season.region.name,
            currencySymbol: team.season.region.currencySymbol,
            formatCode: team.season.format.code,
            formatName: team.season.format.name,
          }
        : null,
    })),
    names,
  });

  let itemsRequired = order.itemsRequired;
  if (order.checkoutGroupId) {
    const group = await prisma.itemPaymentOrder.findMany({
      where: { checkoutGroupId: order.checkoutGroupId, status: 'PENDING' },
      select: { itemsRequired: true },
    });
    itemsRequired = group.reduce((sum, row) => sum + row.itemsRequired, 0);
  }

  return {
    orderNumber: order.orderNumber,
    itemAppId: order.itemAppId,
    itemMarketHashName: order.itemMarketHashName,
    itemName: order.itemName,
    itemsRequired,
    teamId: order.teamId,
    expiresAt: order.expiresAt.toISOString(),
    payer: display.payer,
    moneyLabel: display.moneyLabel,
    spots: display.spots,
  };
}

export async function confirmItemPayment(data: {
  orderNumber: string;
  tradeOfferId: string;
  itemsReceived: number;
  senderSteamId: string;
}) {
  const order = await prisma.itemPaymentOrder.findUnique({
    where: { orderNumber: data.orderNumber },
  });

  if (!order) {
    notFound('Order not found');
  }

  if (order.status !== 'PENDING') {
    badRequest(`Order is not pending (status: ${order.status})`);
  }

  if (order.expiresAt < new Date()) {
    badRequest('Order has expired');
  }

  if (order.playerSteamId !== data.senderSteamId) {
    badRequest('Sender Steam ID does not match order');
  }

  const groupOrders = order.checkoutGroupId
    ? await prisma.itemPaymentOrder.findMany({
        where: { checkoutGroupId: order.checkoutGroupId, status: 'PENDING' },
      })
    : [order];

  const quoted = await quoteParticipationLines(
    groupOrders.map((row) => ({
      teamId: row.teamId,
      playerSteamId: row.paidForSteamIds[0] ?? row.playerSteamId,
    })),
    { skipInvalid: true },
  );
  const withOrders = quoted.map((line) => {
    const match = groupOrders.find(
      (row) =>
        row.teamId === line.teamId &&
        (row.paidForSteamIds[0] ?? row.playerSteamId) === line.playerSteamId,
    );
    return { ...line, itemOrderNumber: match?.orderNumber };
  });

  await prisma.itemPaymentOrder.updateMany({
    where: { id: { in: groupOrders.map((row) => row.id) } },
    data: {
      status: 'COMPLETED',
      tradeOfferId: data.tradeOfferId,
      itemsReceived: data.itemsReceived,
      completedAt: new Date(),
    },
  });

  await recordQuotedSignupPayments({
    payerSteamId: order.playerSteamId,
    lines: withOrders,
    currency: 'ITEMS',
    method: 'items',
    groupKey: order.checkoutGroupId ?? data.tradeOfferId,
    tradeOfferId: data.tradeOfferId,
    itemName: order.itemName,
  });

  await finalizePaidCartLines(
    order.playerSteamId,
    withOrders.map((line) => ({ teamId: line.teamId, playerSteamId: line.playerSteamId })),
  );
}

export async function getItemPaymentOrders(options: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const { status, page = 1, limit = 25 } = options;

  const where: Record<string, unknown> = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }

  const [orders, total] = await Promise.all([
    prisma.itemPaymentOrder.findMany({
      where,
      include: {
        player: { select: { steamId: true, steamUsername: true } },
        team: {
          select: {
            id: true,
            name: true,
            format: { select: { name: true, iconUrl: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.itemPaymentOrder.count({ where }),
  ]);

  return { orders, total, totalPages: Math.ceil(total / limit) };
}

export async function adminCancelItemPaymentOrder(orderNumber: string) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: { orderNumber, status: 'PENDING' },
  });

  if (!order) {
    notFound('Pending order not found');
  }

  return await prisma.itemPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'CANCELLED' },
  });
}

export async function getOrderStatus(orderNumber: string) {
  const order = await prisma.itemPaymentOrder.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      status: true,
      completedAt: true,
      playerSteamId: true,
    },
  });

  return order;
}
