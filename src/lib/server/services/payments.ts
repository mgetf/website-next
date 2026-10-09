/**
 * Payment Service
 *
 * All payment-related business logic and database operations.
 */

import { prisma } from '#lib/server/db.js';
import { notFound, badRequest } from '#lib/server/utils/errors.js';
import {
  itemAmountLabel,
  moneyAmountLabel,
  isItemLedgerCoveredByOrder,
  parseRecordedItemPayment,
} from '#lib/utils/paymentAmount.js';
import { hasMetPaidPlayerRequirement } from '#lib/utils/rosterPayments.js';
import type { Prisma } from '#prisma/client.js';
import { requireFormatById } from './formats';
import type { CheckoutParticipation } from '#lib/types/checkout.js';

type TeamPaymentDb = Pick<Prisma.TransactionClient, 'playerInTeam' | 'team'>;

/**
 * Set team.paymentStatus from current active roster payments.
 * Counts any non-zero player paymentStatus (paid or exempt).
 */
export async function syncTeamPaymentStatus(
  db: TeamPaymentDb,
  teamId: number,
  requiredPaidPlayers: number,
): Promise<boolean> {
  const [paidPlayersCount, activePlayersCount] = await Promise.all([
    db.playerInTeam.count({
      where: { teamId, active: 1, paymentStatus: { not: 0 } },
    }),
    db.playerInTeam.count({
      where: { teamId, active: 1 },
    }),
  ]);

  const met = hasMetPaidPlayerRequirement(
    paidPlayersCount,
    requiredPaidPlayers,
    activePlayersCount,
  );

  await db.team.update({
    where: { id: teamId },
    data: { paymentStatus: met ? 1 : 0 },
  });

  return met;
}

export interface UnpaidPlayer {
  steamId: string;
  name: string;
  avatar: string | null;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
}

export type CheckoutTeamSelection = {
  teamId: number;
  paidForSteamIds: string[];
};

export type ResolvedCheckoutQuote = {
  amount: number;
  currency: string;
  teams: CheckoutTeamSelection[];
};

/**
 * Compare money amounts in cents to avoid float drift.
 */
export function paypalAmountsMatch(expected: number, actual: number): boolean {
  return Math.round(expected * 100) === Math.round(actual * 100);
}

/**
 * Pure helper: sum selected unpaid players' totalCost.
 * Throws via badRequest when a selected steamId is not unpaid on that team.
 */
export function sumSelectedCheckoutAmount(
  selections: { paidForSteamIds: string[]; unpaidPlayers: UnpaidPlayer[] }[],
): number {
  let total = 0;

  for (const selection of selections) {
    if (selection.paidForSteamIds.length === 0) {
      badRequest('At least one unpaid player must be selected per team');
    }

    const unpaidById = new Map(selection.unpaidPlayers.map((p) => [p.steamId, p]));
    for (const steamId of selection.paidForSteamIds) {
      const player = unpaidById.get(steamId);
      if (!player) {
        badRequest('One or more selected players are not unpaid members of the team');
      }
      total += player.totalCost;
    }
  }

  return total;
}

/**
 * Server-side PayPal quote. Never trust client-supplied amounts.
 * Validates every selected player is an active unpaid member and returns
 * the exact amount + currency that must be charged / captured.
 */
export async function resolvePayPalCheckoutQuote(
  teams: CheckoutTeamSelection[],
): Promise<ResolvedCheckoutQuote> {
  if (!Array.isArray(teams) || teams.length === 0) {
    badRequest('At least one team is required');
  }

  const teamIds = teams.map((t) => t.teamId);
  const teamRecords = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    include: {
      division: true,
      region: true,
    },
  });
  const teamMap = new Map(teamRecords.map((t) => [t.id, t]));

  const selectionDetails: { paidForSteamIds: string[]; unpaidPlayers: UnpaidPlayer[] }[] = [];
  const normalizedTeams: CheckoutTeamSelection[] = [];
  let currency: string | null = null;

  for (const selection of teams) {
    const team = teamMap.get(selection.teamId);
    if (!team?.seasonId) {
      badRequest('Team or season not found');
    }

    const teamCurrency = team.region?.currencyCode ?? 'USD';
    if (currency === null) {
      currency = teamCurrency;
    } else if (currency !== teamCurrency) {
      badRequest('Cannot checkout teams with different currencies in one payment');
    }

    const unpaidPlayers = await getTeamUnpaidPlayers(team.id, team.seasonId);
    const requestedIds =
      selection.paidForSteamIds.length > 0
        ? [...new Set(selection.paidForSteamIds)]
        : unpaidPlayers.map((p) => p.steamId);

    selectionDetails.push({ paidForSteamIds: requestedIds, unpaidPlayers });
    normalizedTeams.push({ teamId: team.id, paidForSteamIds: requestedIds });
  }

  const amount = sumSelectedCheckoutAmount(selectionDetails);

  if (amount <= 0) {
    badRequest('Payment amount must be greater than zero');
  }

  return {
    amount,
    currency: currency ?? 'USD',
    teams: normalizedTeams,
  };
}

/**
 * Load all unpaid active players in a team with their individual costs.
 * Used by the checkout page to allow paying for teammates.
 */
export async function getTeamUnpaidPlayers(
  teamId: number,
  seasonId: number,
): Promise<UnpaidPlayer[]> {
  const unpaidPlayersInTeam = await prisma.playerInTeam.findMany({
    where: { teamId, active: 1, paymentStatus: 0 },
    include: {
      player: { select: { steamId: true, steamUsername: true, steamAvatar: true } },
      team: { include: { division: true } },
    },
  });

  if (unpaidPlayersInTeam.length === 0) return [];

  const signupCost = unpaidPlayersInTeam[0]?.team.division?.signupCost ?? 0;
  const leagueFees = await getLeagueFees();

  const steamIds = unpaidPlayersInTeam.map((p) => p.playerSteamId);
  const paymentTrackers = await prisma.paymentTracker.findMany({
    where: { playerSteamId: { in: steamIds }, seasonId },
  });
  const trackerMap = new Map(paymentTrackers.map((pt) => [pt.playerSteamId, pt.amount]));

  return unpaidPlayersInTeam.map((p) => {
    const existingAmount = trackerMap.get(p.playerSteamId) ?? 0;
    const isFirstPayment = existingAmount === 0;
    const playerLeagueFees = isFirstPayment ? leagueFees : 0;
    return {
      steamId: p.player.steamId,
      name: p.player.steamUsername,
      avatar: p.player.steamAvatar,
      signupCost,
      leagueFees: playerLeagueFees,
      totalCost: signupCost + playerLeagueFees,
    };
  });
}

/**
 * Get existing payment for a season
 */
export async function getExistingPayment(steamId: string, seasonId: number) {
  return await prisma.paymentTracker.findUnique({
    where: {
      playerSteamId_seasonId: {
        playerSteamId: steamId,
        seasonId,
      },
    },
  });
}

/**
 * Get league fees from global settings
 */
export async function getLeagueFees(): Promise<number> {
  const global = await prisma.global.findFirst();
  return global?.leagueFees ?? 0;
}

/**
 * Mark a player as paid manually (for payments made outside PayPal).
 * Records a Payment and PaymentTracker entry for audit consistency,
 * then updates PlayerInTeam and Team payment statuses.
 */
export async function markPlayerAsPaidManually(
  steamId: string,
  teamId: number,
  adminSteamId: string,
): Promise<void> {
  const playerInTeam = await prisma.playerInTeam.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    include: {
      team: {
        include: { division: true },
      },
    },
  });

  if (!playerInTeam) {
    notFound('Player is not on this team');
  }

  if (playerInTeam.paymentStatus !== 0) {
    badRequest('Player is already marked as paid');
  }

  if (!playerInTeam.team.seasonId) {
    badRequest('Team has no associated season');
  }

  const seasonId = playerInTeam.team.seasonId;
  const signupCost = playerInTeam.team.division?.signupCost ?? 0;
  const paymentId = `manual-${Date.now()}-${steamId}`;

  await prisma.$transaction(async (tx) => {
    if (signupCost > 0) {
      await tx.paymentTracker.upsert({
        where: { playerSteamId_seasonId: { playerSteamId: steamId, seasonId } },
        create: { playerSteamId: steamId, seasonId, amount: signupCost },
        update: { amount: { increment: signupCost } },
      });

      await tx.payment.create({
        data: {
          paymentId,
          purchasedFor: steamId,
          purchasedBy: adminSteamId,
          amount: signupCost.toString(),
          currency: 'MANUAL',
          purchaseDate: new Date(),
          description: `Manual payment - Team #${teamId}`,
          teamId,
        },
      });
    }

    await tx.playerInTeam.update({
      where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
      data: { paymentStatus: 1 },
    });

    const format = await requireFormatById(playerInTeam.team.formatId);
    await syncTeamPaymentStatus(tx, teamId, format.requiredPaidPlayers);
  });
}

function trackerAmountAfterUnmark(current: number, signupCost: number): number {
  return Math.max(0, Math.round((current - signupCost) * 100) / 100);
}

/**
 * Return a paid player to unpaid.
 * Removes this team's manual payment row and reduces the season tracker by the signup fee.
 * PayPal and item payment rows stay in place.
 */
export async function unmarkPlayerAsPaid(steamId: string, teamId: number): Promise<void> {
  const playerInTeam = await prisma.playerInTeam.findUnique({
    where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
    include: {
      team: {
        include: { division: true },
      },
    },
  });

  if (!playerInTeam) {
    notFound('Player is not on this team');
  }

  if (playerInTeam.paymentStatus !== 1) {
    badRequest('Player is not marked as paid');
  }

  if (!playerInTeam.team.seasonId) {
    badRequest('Team has no associated season');
  }

  const seasonId = playerInTeam.team.seasonId;
  const signupCost = playerInTeam.team.division?.signupCost ?? 0;

  await prisma.$transaction(async (tx) => {
    if (signupCost > 0) {
      const tracker = await tx.paymentTracker.findUnique({
        where: { playerSteamId_seasonId: { playerSteamId: steamId, seasonId } },
      });

      if (tracker) {
        const nextAmount = trackerAmountAfterUnmark(tracker.amount, signupCost);
        if (nextAmount === 0) {
          await tx.paymentTracker.delete({ where: { id: tracker.id } });
        } else {
          await tx.paymentTracker.update({
            where: { id: tracker.id },
            data: { amount: nextAmount },
          });
        }
      }

      await tx.payment.deleteMany({
        where: {
          purchasedFor: steamId,
          teamId,
          currency: 'MANUAL',
        },
      });
    }

    await tx.playerInTeam.update({
      where: { playerSteamId_teamId: { playerSteamId: steamId, teamId } },
      data: { paymentStatus: 0 },
    });

    const format = await requireFormatById(playerInTeam.team.formatId);
    await syncTeamPaymentStatus(tx, teamId, format.requiredPaidPlayers);
  });
}

/**
 * Record a completed PayPal capture: creates payment records and updates player/team payment status.
 * Supports paying for multiple players in a single capture.
 */
export async function recordPayPalCapture(options: {
  payerSteamId: string;
  paidForSteamIds: string[];
  teamId: number;
  captureId: string;
  amount: number;
  currency: string;
}): Promise<void> {
  const { payerSteamId, paidForSteamIds, teamId, captureId, amount, currency } = options;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { division: true, format: true },
  });

  if (!team?.seasonId) {
    notFound('Team or season not found');
  }

  const seasonId = team.seasonId;
  const signupCost = team.division?.signupCost ?? 0;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < paidForSteamIds.length; i++) {
      const targetSteamId = paidForSteamIds[i]!;

      const pit = await tx.playerInTeam.findUnique({
        where: { playerSteamId_teamId: { playerSteamId: targetSteamId, teamId } },
      });
      if (!pit || pit.paymentStatus !== 0) continue;

      await tx.paymentTracker.upsert({
        where: { playerSteamId_seasonId: { playerSteamId: targetSteamId, seasonId } },
        create: { playerSteamId: targetSteamId, seasonId, amount: signupCost },
        update: { amount: { increment: signupCost } },
      });

      await tx.payment.create({
        data: {
          paymentId: `${captureId}-${i}`,
          paypalCaptureId: captureId,
          purchasedFor: targetSteamId,
          purchasedBy: payerSteamId,
          amount: signupCost.toString(),
          currency,
          purchaseDate: new Date(),
          description: `Team signup payment - Team #${teamId}`,
          teamId,
        },
      });

      await tx.playerInTeam.update({
        where: { playerSteamId_teamId: { playerSteamId: targetSteamId, teamId } },
        data: { paymentStatus: 1 },
      });
    }

    await syncTeamPaymentStatus(tx, teamId, team.format.requiredPaidPlayers);
  });
}

export interface PaymentHistoryEntry {
  id: string;
  date: Date;
  method: 'paypal' | 'items' | 'manual';
  description: string;
  amount: string;
  amountLabel: string;
  iconUrl: string | null;
  currency: string;
  teamId: number | null;
  teamName: string | null;
  regionName: string | null;
  seasonNum: number | null;
  division: string | null;
  formatName: string | null;
  formatIconUrl: string | null;
  status: 'completed' | 'pending' | 'expired' | 'cancelled' | 'refunded' | 'refund_pending';
  refundable: boolean;
  refundBlockReason: string | null;
  canRemoveFromTeam: boolean;
}

const historyTeamSelect = {
  id: true,
  name: true,
  division: { select: { name: true } },
  region: { select: { name: true } },
  season: { select: { seasonNum: true } },
  format: { select: { name: true, iconUrl: true } },
} as const;

function historyTeamScope(
  team: {
    id: number;
    name: string;
    division: { name: string } | null;
    region: { name: string } | null;
    season: { seasonNum: number } | null;
    format: { name: string; iconUrl: string | null } | null;
  } | null,
) {
  return {
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    regionName: team?.region?.name ?? null,
    seasonNum: team?.season?.seasonNum ?? null,
    division: team?.division?.name ?? null,
    formatName: team?.format?.name ?? null,
    formatIconUrl: team?.format?.iconUrl ?? null,
  };
}

export async function getUserPaymentHistory(
  steamId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{ entries: PaymentHistoryEntry[]; total: number }> {
  const [payments, itemOrders, refunds, account, steamItems] = await Promise.all([
    prisma.payment.findMany({
      where: { purchasedBy: steamId },
      include: { team: { select: historyTeamSelect } },
      orderBy: { purchaseDate: 'desc' },
    }),
    prisma.itemPaymentOrder.findMany({
      where: { playerSteamId: steamId },
      include: { team: { select: historyTeamSelect } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paymentRefund.findMany({
      where: { playerSteamId: steamId, status: { in: ['PENDING', 'COMPLETED'] } },
      select: { paymentId: true, itemOrderNumber: true, status: true },
    }),
    prisma.user.findUnique({
      where: { steamId },
      select: { tradeOfferUrl: true },
    }),
    prisma.steamItem.findMany({
      select: { name: true, marketHashName: true, iconUrl: true },
    }),
  ]);

  const iconByName = new Map(steamItems.map((item) => [item.name, item.iconUrl]));
  const iconByHash = new Map(steamItems.map((item) => [item.marketHashName, item.iconUrl]));

  const itemOrderNumbers = new Set(itemOrders.map((order) => order.orderNumber));
  const itemTradeOfferIds = new Set(
    itemOrders.flatMap((order) => (order.tradeOfferId ? [order.tradeOfferId] : [])),
  );

  const refundByPayment = new Map(
    refunds.filter((row) => row.paymentId).map((row) => [row.paymentId as string, row.status]),
  );
  const refundByOrder = new Map(
    refunds
      .filter((row) => row.itemOrderNumber)
      .map((row) => [row.itemOrderNumber as string, row.status]),
  );

  const rosterKeys = new Set<string>();
  for (const payment of payments) {
    if (payment.teamId) rosterKeys.add(`${payment.teamId}:${payment.purchasedFor}`);
  }
  for (const order of itemOrders) {
    const targets =
      order.paidForSteamIds.length > 0 ? order.paidForSteamIds : [order.playerSteamId];
    for (const target of targets) rosterKeys.add(`${order.teamId}:${target}`);
  }
  const roster = rosterKeys.size
    ? await prisma.playerInTeam.findMany({
        where: {
          active: 1,
          OR: [...rosterKeys].map((key) => {
            const [teamId, playerSteamId] = key.split(':');
            return { teamId: Number(teamId), playerSteamId };
          }),
        },
        select: { teamId: true, playerSteamId: true, permissionLevel: true },
      })
    : [];
  const removable = new Set(
    roster
      .filter((row) => row.permissionLevel !== 2)
      .map((row) => `${row.teamId}:${row.playerSteamId}`),
  );

  const entries: PaymentHistoryEntry[] = [];
  const refundWindowMs = 180 * 24 * 60 * 60 * 1000;
  const hasTradeOfferUrl = Boolean(account?.tradeOfferUrl);

  for (const p of payments) {
    if (isItemLedgerCoveredByOrder(p, itemOrderNumbers, itemTradeOfferIds)) continue;

    let method: PaymentHistoryEntry['method'] = 'paypal';
    if (p.currency === 'ITEMS') method = 'items';
    else if (p.currency === 'MANUAL') method = 'manual';

    const openRefund = refundByPayment.get(p.paymentId);
    let status: PaymentHistoryEntry['status'] = 'completed';
    let refundable = method === 'paypal';
    let refundBlockReason: string | null = null;
    if (method === 'manual') {
      refundable = false;
      refundBlockReason = 'Manual payments are not refunded automatically.';
    } else if (method === 'items') {
      refundable = false;
      refundBlockReason = 'Refund the Steam item order instead.';
    } else if (openRefund === 'COMPLETED') {
      status = 'refunded';
      refundable = false;
      refundBlockReason = 'Already refunded.';
    } else if (openRefund === 'PENDING') {
      status = 'refund_pending';
      refundable = false;
      refundBlockReason = 'A refund is already in progress.';
    } else if (Date.now() - p.purchaseDate.getTime() > refundWindowMs) {
      refundable = false;
      refundBlockReason = 'PayPal only allows refunds within 180 days of the payment.';
    }

    const recordedItem = method === 'items' ? parseRecordedItemPayment(p.description ?? '') : null;
    entries.push({
      id: p.paymentId,
      date: p.purchaseDate,
      method,
      description: p.description ?? '',
      amount: p.amount,
      amountLabel:
        method === 'manual'
          ? 'Manual'
          : method === 'items'
            ? recordedItem
              ? itemAmountLabel(recordedItem.name, recordedItem.quantity)
              : (p.description ?? 'Items')
            : moneyAmountLabel(p.amount, p.currency ?? 'USD'),
      iconUrl:
        method === 'items' && recordedItem ? (iconByName.get(recordedItem.name) ?? null) : null,
      currency: p.currency ?? 'USD',
      ...historyTeamScope(p.team),
      status,
      refundable,
      refundBlockReason,
      canRemoveFromTeam: p.teamId ? removable.has(`${p.teamId}:${p.purchasedFor}`) : false,
    });
  }

  for (const o of itemOrders) {
    const statusMap: Record<string, PaymentHistoryEntry['status']> = {
      COMPLETED: 'completed',
      PENDING: 'pending',
      EXPIRED: 'expired',
      CANCELLED: 'cancelled',
      REFUNDED: 'refunded',
    };
    const openRefund = refundByOrder.get(o.orderNumber);
    let status = statusMap[o.status] ?? 'pending';
    let refundable = o.status === 'COMPLETED';
    let refundBlockReason: string | null = null;
    if (o.status === 'REFUNDED' || openRefund === 'COMPLETED') {
      status = 'refunded';
      refundable = false;
      refundBlockReason = 'Already refunded.';
    } else if (openRefund === 'PENDING') {
      status = 'refund_pending';
      refundable = false;
      refundBlockReason = 'A refund is already in progress.';
    } else if (o.status !== 'COMPLETED') {
      refundable = false;
      refundBlockReason = 'Only a completed item payment can be refunded.';
    } else if (!hasTradeOfferUrl) {
      refundable = false;
      refundBlockReason = 'This player has not saved a Steam trade offer link.';
    }

    const targets = o.paidForSteamIds.length > 0 ? o.paidForSteamIds : [o.playerSteamId];
    const iconFromHash = iconByHash.get(o.itemMarketHashName);
    entries.push({
      id: o.orderNumber,
      date: o.status === 'COMPLETED' && o.completedAt ? o.completedAt : o.createdAt,
      method: 'items',
      description: `${o.itemsRequired}x ${o.itemName}`,
      amount: `${o.itemsRequired}`,
      amountLabel: itemAmountLabel(o.itemName, o.itemsRequired),
      iconUrl: iconFromHash !== undefined ? iconFromHash : (iconByName.get(o.itemName) ?? null),
      currency: 'ITEMS',
      ...historyTeamScope(o.team),
      status,
      refundable,
      refundBlockReason,
      canRemoveFromTeam: targets.some((target) => removable.has(`${o.teamId}:${target}`)),
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = entries.length;
  const start = (page - 1) * limit;
  const paginated = entries.slice(start, start + limit);

  return { entries: paginated, total };
}

/**
 * Load checkout participations for a user's active teams.
 * A team is included when someone on the roster still owes a signup fee,
 * including when this user already paid and is covering a teammate.
 * Individual formats stay limited to the user's own unpaid fee.
 */
export async function getAllUnpaidParticipations(
  steamId: string,
): Promise<CheckoutParticipation[]> {
  const playerInTeams = await prisma.playerInTeam.findMany({
    where: {
      playerSteamId: steamId,
      active: 1,
      team: {
        division: { signupCost: { gt: 0 } },
        players: { some: { active: 1, paymentStatus: 0 } },
      },
    },
    include: {
      team: {
        include: {
          division: {
            include: {
              itemPayment: { include: { steamItem: true } },
            },
          },
          region: true,
          season: true,
          format: true,
        },
      },
    },
  });

  const result: CheckoutParticipation[] = [];

  for (const pit of playerInTeams) {
    const team = pit.team;
    const division = team.division;
    const region = team.region;
    const season = team.season;

    if (!division || !team.seasonId) continue;
    if (team.format.isIndividual && pit.paymentStatus !== 0) continue;

    const unpaidPlayers = await getTeamUnpaidPlayers(team.id, team.seasonId);
    if (unpaidPlayers.length === 0) continue;

    result.push({
      teamId: team.id,
      teamName: team.name,
      teamAvatar: team.avatar,
      formatName: team.format.name,
      formatThemeKey: team.format.themeKey,
      formatIconUrl: team.format.iconUrl,
      formatId: team.formatId,
      isIndividual: team.format.isIndividual,
      divisionName: division.name,
      divisionId: division.id,
      regionName: region?.name ?? null,
      seasonNum: season?.seasonNum ?? null,
      seasonId: team.seasonId,
      signupCost: division.signupCost,
      currency: region?.currencyCode ?? 'USD',
      currencySymbol: region?.currencySymbol ?? '$',
      unpaidPlayers,
      itemPaymentConfig: division.itemPayment
        ? {
            itemName: division.itemPayment.steamItem.name,
            itemQuantity: division.itemPayment.itemQuantity,
            itemAppId: division.itemPayment.steamItem.appId,
          }
        : null,
    });
  }

  return result;
}

/**
 * Record completed PayPal captures for multiple teams in a single transaction.
 * League fee is charged once per season and is tracked via PaymentTracker;
 * we simply record the signupCost increment per player (matching single-team behaviour).
 */
export async function recordMultiTeamPayPalCapture(options: {
  payerSteamId: string;
  teams: { teamId: number; paidForSteamIds: string[] }[];
  captureId: string;
  currency: string;
}): Promise<void> {
  const { payerSteamId, teams, captureId, currency } = options;

  const teamRecords = await prisma.team.findMany({
    where: { id: { in: teams.map((t) => t.teamId) } },
    include: { division: true, format: true },
  });

  const teamMap = new Map(teamRecords.map((t) => [t.id, t]));

  await prisma.$transaction(async (tx) => {
    let paymentIndex = 0;

    for (const { teamId, paidForSteamIds } of teams) {
      const team = teamMap.get(teamId);
      if (!team?.seasonId) continue;

      const seasonId = team.seasonId;
      const signupCost = team.division?.signupCost ?? 0;

      for (const targetSteamId of paidForSteamIds) {
        const pit = await tx.playerInTeam.findUnique({
          where: { playerSteamId_teamId: { playerSteamId: targetSteamId, teamId } },
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
            paymentId: `${captureId}-${paymentIndex}`,
            paypalCaptureId: captureId,
            purchasedFor: targetSteamId,
            purchasedBy: payerSteamId,
            amount: signupCost.toString(),
            currency,
            purchaseDate: new Date(),
            description: `Team signup payment - Team #${teamId}`,
            teamId,
          },
        });

        await tx.playerInTeam.update({
          where: { playerSteamId_teamId: { playerSteamId: targetSteamId, teamId } },
          data: { paymentStatus: 1 },
        });

        paymentIndex++;
      }

      await syncTeamPaymentStatus(tx, teamId, team.format.requiredPaidPlayers);
    }
  });
}

/**
 * Check if division requires payment and if user has paid
 * Returns payment information for redirect decision
 *
 * Payment logic (matching old website):
 * - First-time payer: totalCost = signupCost + leagueFees
 * - Has existing payment: totalCost = signupCost only (league fees already paid)
 *
 * Used at signup (and later if an admin reassigns a team to a paid division).
 */
export async function checkPaymentRequired(options: {
  divisionId: number;
  steamId: string;
  seasonId: number | undefined;
}): Promise<{
  required: boolean;
  alreadyPaid: boolean;
  amountPaid: number;
  signupCost: number;
  leagueFees: number;
  totalCost: number;
  isFirstPayment: boolean;
}> {
  const { divisionId, steamId, seasonId } = options;

  const [division, leagueFees] = await Promise.all([
    prisma.division.findUnique({ where: { id: divisionId } }),
    getLeagueFees(),
  ]);

  if (!division) {
    notFound('Division not found');
  }

  // Free division - no payment required
  if (division.signupCost === 0) {
    return {
      required: false,
      alreadyPaid: true,
      amountPaid: 0,
      signupCost: 0,
      leagueFees: 0,
      totalCost: 0,
      isFirstPayment: false,
    };
  }

  // No season ID - payment required but can't check existing payments
  if (!seasonId) {
    return {
      required: true,
      alreadyPaid: false,
      amountPaid: 0,
      signupCost: division.signupCost,
      leagueFees,
      totalCost: division.signupCost + leagueFees,
      isFirstPayment: true,
    };
  }

  const existingPayment = await getExistingPayment(steamId, seasonId);
  const amountPaid = existingPayment?.amount || 0;
  const isFirstPayment = amountPaid === 0;

  // First-time payers pay signupCost + leagueFees
  // Returning payers only pay remaining signupCost (league fees already paid)
  const totalCost = isFirstPayment ? division.signupCost + leagueFees : division.signupCost;

  const alreadyPaid = amountPaid >= totalCost;

  return {
    required: true,
    alreadyPaid,
    amountPaid,
    signupCost: division.signupCost,
    leagueFees: isFirstPayment ? leagueFees : 0,
    totalCost,
    isFirstPayment,
  };
}
