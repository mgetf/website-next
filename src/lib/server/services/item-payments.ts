import { prisma } from '$lib/server/db';
import { notFound, badRequest } from '$lib/server/utils/errors';
import { FORMAT_1V1 } from '$lib/server/constants/formats';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';
import type { CheckoutTeamSelection } from '$lib/types/checkout';

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
    notFound('Team not found');
  }

  const division = playerInTeam.team.division;
  if (!division?.itemPayment) {
    badRequest('This division does not accept item payments');
  }

  if (!playerInTeam.team.seasonId) {
    badRequest('Team has no associated season');
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
    badRequest('You already have a pending item payment order for this team');
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

  return {
    orderNumber: order.orderNumber,
    itemName: order.itemName,
    itemsRequired: order.itemsRequired,
    expiresAt: order.expiresAt.toISOString(),
    checkoutTeams: order.checkoutTeams
      ? (JSON.parse(order.checkoutTeams) as CheckoutTeamSelection[])
      : null,
  };
}

/**
 * Create a single item payment order covering multiple teams.
 * All teams must share the same item type and app ID.
 */
export async function createMultiTeamItemOrder(steamId: string, teams: CheckoutTeamSelection[]) {
  if (teams.length === 0) {
    badRequest('No teams provided');
  }

  const firstTeam = teams[0]!;

  const teamRecords = await prisma.playerInTeam.findMany({
    where: {
      playerSteamId: steamId,
      teamId: { in: teams.map((t) => t.teamId) },
      active: 1,
    },
    include: {
      team: {
        include: {
          division: {
            include: { itemPayment: { include: { steamItem: true } } },
          },
        },
      },
    },
  });

  if (teamRecords.length !== teams.length) {
    badRequest('One or more teams not found or you are not an active member');
  }

  for (const record of teamRecords) {
    if (!record.team.division?.itemPayment) {
      badRequest(`Division for team "${record.team.name}" does not accept item payments`);
    }
    if (!record.team.seasonId) {
      badRequest(`Team "${record.team.name}" has no associated season`);
    }
  }

  const firstRecord = teamRecords.find((r) => r.teamId === firstTeam.teamId)!;
  const referenceItem = firstRecord.team.division!.itemPayment!.steamItem;

  for (const record of teamRecords) {
    const item = record.team.division!.itemPayment!.steamItem;
    if (item.appId !== referenceItem.appId || item.name !== referenceItem.name) {
      badRequest('All selected teams must use the same item type for item payments');
    }
  }

  const existingOrder = await prisma.itemPaymentOrder.findFirst({
    where: {
      playerSteamId: steamId,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });

  if (existingOrder) {
    badRequest('You already have a pending item payment order');
  }

  let totalItemsRequired = 0;
  for (const teamSel of teams) {
    const record = teamRecords.find((r) => r.teamId === teamSel.teamId)!;
    const itemQuantity = record.team.division!.itemPayment!.itemQuantity;
    const targets = teamSel.paidForSteamIds.length > 0 ? teamSel.paidForSteamIds : [steamId];
    totalItemsRequired += itemQuantity * targets.length;
  }

  const expiresAt = new Date(Date.now() + ITEM_ORDER_EXPIRY_MS);
  const checkoutTeamsJson = JSON.stringify(
    teams.map((t) => ({
      teamId: t.teamId,
      paidForSteamIds: t.paidForSteamIds.length > 0 ? t.paidForSteamIds : [steamId],
    })),
  );

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.itemPaymentOrder.create({
      data: {
        orderNumber: 'IP-TEMP',
        playerSteamId: steamId,
        teamId: firstTeam.teamId,
        seasonId: firstRecord.team.seasonId!,
        itemName: referenceItem.name,
        itemAppId: referenceItem.appId,
        itemMarketHashName: referenceItem.marketHashName,
        itemsRequired: totalItemsRequired,
        paidForSteamIds:
          firstTeam.paidForSteamIds.length > 0 ? firstTeam.paidForSteamIds : [steamId],
        checkoutTeams: checkoutTeamsJson,
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

  const description = `Item payment - ${order.itemsRequired}x ${order.itemName} (Order ${order.orderNumber})`;

  if (order.checkoutTeams) {
    const checkoutTeams = JSON.parse(order.checkoutTeams) as CheckoutTeamSelection[];

    const teamIds = checkoutTeams.map((t) => t.teamId);
    const teamRecords = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      include: { division: true },
    });
    const teamMap = new Map(teamRecords.map((t) => [t.id, t]));

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

      let paymentIndex = 0;

      for (const teamSel of checkoutTeams) {
        const team = teamMap.get(teamSel.teamId);
        if (!team?.seasonId) continue;

        const signupCost = team.division?.signupCost ?? 0;
        const seasonId = team.seasonId;
        const targets =
          teamSel.paidForSteamIds.length > 0 ? teamSel.paidForSteamIds : [order.playerSteamId];

        for (const targetSteamId of targets) {
          const pit = await tx.playerInTeam.findUnique({
            where: {
              playerSteamId_teamId: { playerSteamId: targetSteamId, teamId: teamSel.teamId },
            },
          });
          if (!pit || pit.paymentStatus !== 0) {
            paymentIndex++;
            continue;
          }

          await tx.paymentTracker.upsert({
            where: { playerSteamId_seasonId: { playerSteamId: targetSteamId, seasonId } },
            create: { playerSteamId: targetSteamId, seasonId, amount: signupCost },
            update: { amount: { increment: signupCost } },
          });

          await tx.payment.create({
            data: {
              paymentId: `${data.tradeOfferId}-${paymentIndex}`,
              purchasedFor: targetSteamId,
              purchasedBy: order.playerSteamId,
              amount: signupCost.toString(),
              currency: 'ITEMS',
              purchaseDate: new Date(),
              description,
              teamId: teamSel.teamId,
            },
          });

          await tx.playerInTeam.update({
            where: {
              playerSteamId_teamId: { playerSteamId: targetSteamId, teamId: teamSel.teamId },
            },
            data: { paymentStatus: 1 },
          });

          paymentIndex++;
        }

        const paidPlayersCount = await tx.playerInTeam.count({
          where: { teamId: teamSel.teamId, active: 1, paymentStatus: 1 },
        });

        const requiredPaidPlayers = team.formatId === FORMAT_1V1 ? 1 : 2;

        if (paidPlayersCount >= requiredPaidPlayers) {
          await tx.team.update({
            where: { id: teamSel.teamId },
            data: { paymentStatus: 1 },
          });
        }
      }
    });

    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: order.teamId },
    include: { division: true },
  });

  if (!team) {
    notFound('Team not found');
  }

  const signupCost = team.division?.signupCost ?? 0;
  const seasonId = order.seasonId;

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
      if (!pit || pit.paymentStatus !== 0) continue;

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
