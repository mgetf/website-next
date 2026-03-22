import { prisma } from '$lib/server/db';
import { error } from '@sveltejs/kit';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

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

export async function createItemPaymentOrder(
  steamId: string,
  teamId: number,
  paidForSteamIds: string[],
) {
  const playerInTeam = await prisma.playerInTeam.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    include: {
      team: {
        include: {
          division: {
            include: {
              itemPayment: { include: { steamItem: true } },
            },
          },
        },
      },
    },
  });

  if (!playerInTeam?.team) {
    throw error(404, 'Team not found');
  }

  const division = playerInTeam.team.division;
  if (!division?.itemPayment) {
    throw error(400, 'This division does not accept item payments');
  }

  if (!playerInTeam.team.seasonId) {
    throw error(400, 'Team has no associated season');
  }

  const existingOrder = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      teamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });

  if (existingOrder) {
    throw error(400, 'You already have a pending item payment order for this team');
  }

  const targets = paidForSteamIds.length > 0 ? paidForSteamIds : [steamId];

  const { steamItem } = division.itemPayment;
  const itemQuantityPerPlayer = division.itemPayment.itemQuantity;
  const totalItemsRequired = itemQuantityPerPlayer * targets.length;
  const expiresAt = new Date(Date.now() + ITEM_ORDER_EXPIRY_MS);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.itemPaymentOrder.create({
      data: {
        orderNumber: 'IP-TEMP',
        playerSteamId: steamId,
        teamId,
        seasonId: playerInTeam.team.seasonId!,
        itemName: steamItem.name,
        itemAppId: steamItem.appId,
        itemMarketHashName: steamItem.marketHashName,
        itemsRequired: totalItemsRequired,
        paidForSteamIds: targets,
        expiresAt,
      },
    });

    return await tx.itemPaymentOrder.update({
      where: { id: created.id },
      data: { orderNumber: `IP-${created.id.toString().padStart(5, '0')}` },
    });
  });

  return order;
}

export async function getPendingOrderForCheckout(steamId: string, teamId: number) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      teamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });

  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    itemName: order.itemName,
    itemsRequired: order.itemsRequired,
    expiresAt: order.expiresAt.toISOString(),
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
    throw error(404, 'Pending order not found');
  }

  return await prisma.itemPaymentOrder.update({
    where: { id: order.id },
    data: { status: 'CANCELLED' },
  });
}

export async function getPendingOrderBySteamId(steamId: string) {
  const order = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });

  if (!order) return null;

  return {
    orderNumber: order.orderNumber,
    itemAppId: order.itemAppId,
    itemMarketHashName: order.itemMarketHashName,
    itemsRequired: order.itemsRequired,
    teamId: order.teamId,
    expiresAt: order.expiresAt.toISOString(),
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
    throw error(404, 'Order not found');
  }

  if (order.status !== 'PENDING') {
    throw error(400, `Order is not pending (status: ${order.status})`);
  }

  if (order.expiresAt < new Date()) {
    throw error(400, 'Order has expired');
  }

  if (order.playerSteamId !== data.senderSteamId) {
    throw error(400, 'Sender Steam ID does not match order');
  }

  const team = await prisma.team.findUnique({
    where: { id: order.teamId },
    include: { division: true },
  });

  if (!team) {
    throw error(404, 'Team not found');
  }

  const signupCost = team.division?.signupCost ?? 0;
  const seasonId = order.seasonId;
  const description = `Item payment - ${order.itemsRequired}x ${order.itemName} (Order ${order.orderNumber})`;

  const targets = order.paidForSteamIds.length > 0 ? order.paidForSteamIds : [order.playerSteamId];

  await prisma.$transaction(async (tx) => {
    await tx.itemPaymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        tradeOfferId: data.tradeOfferId,
        itemsReceived: data.itemsReceived,
        completedAt: new Date(),
      },
    });

    for (let i = 0; i < targets.length; i++) {
      const targetSteamId = targets[i]!;

      const pit = await tx.playerInTeam.findUnique({
        where: { playerSteamId_teamId: { playerSteamId: targetSteamId, teamId: order.teamId } },
      });
      if (!pit || pit.paymentStatus === 1) continue;

      await tx.paymentTracker.upsert({
        where: {
          playerSteamId_seasonId: { playerSteamId: targetSteamId, seasonId },
        },
        create: { playerSteamId: targetSteamId, seasonId, amount: signupCost },
        update: { amount: { increment: signupCost } },
      });

      await tx.payment.create({
        data: {
          paymentId: `${data.tradeOfferId}-${i}`,
          purchasedFor: targetSteamId,
          purchasedBy: order.playerSteamId,
          amount: signupCost.toString(),
          currency: 'ITEMS',
          purchaseDate: new Date(),
          description,
          teamId: order.teamId,
        },
      });

      await tx.playerInTeam.update({
        where: {
          playerSteamId_teamId: { playerSteamId: targetSteamId, teamId: order.teamId },
        },
        data: { paymentStatus: 1 },
      });
    }

    const paidPlayersCount = await tx.playerInTeam.count({
      where: { teamId: order.teamId, active: 1, paymentStatus: 1 },
    });

    const requiredPaidPlayers = team.formatId === FORMAT_1V1 ? 1 : 2;

    if (paidPlayersCount >= requiredPaidPlayers) {
      await tx.team.update({
        where: { id: order.teamId },
        data: { paymentStatus: 1 },
      });
    }
  });
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
        team: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
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
    throw error(404, 'Pending order not found');
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
