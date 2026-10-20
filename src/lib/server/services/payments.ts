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
  parseRecordedItemPayment,
} from '#lib/utils/paymentAmount.js';
import { hasMetPaidPlayerRequirement } from '#lib/utils/rosterPayments.js';
import type { Prisma } from '#prisma/client.js';
import { requireFormatById } from './formats';
import type { CheckoutItemPaymentConfig } from '#lib/types/checkout.js';
import type { QuotedParticipation } from '#lib/types/cart.js';
import {
  getInvoiceNumbersForPayments,
  issueInvoicesForRecordedPayments,
  type RecordedPaymentForInvoice,
} from './invoices.js';

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

/**
 * Compare money amounts in cents to avoid float drift.
 */
export function paypalAmountsMatch(expected: number, actual: number): boolean {
  return Math.round(expected * 100) === Math.round(actual * 100);
}

export function leagueFeeForLine(options: {
  playerSteamId: string;
  seasonId: number;
  trackerAmount: number;
  seenFirst: Set<string>;
  leagueFees: number;
}): number {
  const key = `${options.playerSteamId}:${options.seasonId}`;
  if (options.trackerAmount > 0 || options.seenFirst.has(key)) return 0;
  options.seenFirst.add(key);
  return options.leagueFees;
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

const quoteTeamInclude = {
  division: {
    include: {
      itemPayment: { include: { steamItem: true } },
    },
  },
  region: true,
  season: true,
  format: true,
} as const;

function itemConfigFromDivision(
  division: {
    itemPayment: {
      itemQuantity: number;
      steamItem: { name: string; appId: number };
    } | null;
  } | null,
): CheckoutItemPaymentConfig | null {
  if (!division?.itemPayment) return null;
  return {
    itemName: division.itemPayment.steamItem.name,
    itemQuantity: division.itemPayment.itemQuantity,
    itemAppId: division.itemPayment.steamItem.appId,
  };
}

/**
 * Live price for unpaid active roster spots. Dropped (or rejected) when the
 * player is not an unpaid member of a paid division.
 */
export async function quoteParticipationLines(
  lines: { teamId: number; playerSteamId: string }[],
  options?: { skipInvalid?: boolean },
): Promise<QuotedParticipation[]> {
  if (lines.length === 0) return [];

  const skipInvalid = options?.skipInvalid ?? false;
  const teamIds = [...new Set(lines.map((line) => line.teamId))];
  const steamIds = [...new Set(lines.map((line) => line.playerSteamId))];

  const [teams, memberships, users, leagueFees] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      include: quoteTeamInclude,
    }),
    prisma.playerInTeam.findMany({
      where: {
        teamId: { in: teamIds },
        playerSteamId: { in: steamIds },
        active: 1,
        paymentStatus: 0,
      },
    }),
    prisma.user.findMany({
      where: { steamId: { in: steamIds } },
      select: { steamId: true, steamUsername: true, steamAvatar: true },
    }),
    getLeagueFees(),
  ]);

  const teamMap = new Map(teams.map((team) => [team.id, team]));
  const memberSet = new Set(memberships.map((row) => `${row.teamId}:${row.playerSteamId}`));
  const userMap = new Map(users.map((user) => [user.steamId, user]));

  const seasonIds = [
    ...new Set(teams.map((team) => team.seasonId).filter((id): id is number => id != null)),
  ];
  const trackers =
    seasonIds.length === 0
      ? []
      : await prisma.paymentTracker.findMany({
          where: { playerSteamId: { in: steamIds }, seasonId: { in: seasonIds } },
        });
  const trackerMap = new Map(
    trackers.map((row) => [`${row.playerSteamId}:${row.seasonId}`, row.amount]),
  );

  const seenFirst = new Set<string>();
  const quoted: QuotedParticipation[] = [];

  for (const line of lines) {
    const team = teamMap.get(line.teamId);
    const division = team?.division;
    const user = userMap.get(line.playerSteamId);
    const payable =
      team &&
      division &&
      team.seasonId &&
      division.signupCost > 0 &&
      memberSet.has(`${line.teamId}:${line.playerSteamId}`) &&
      user;

    if (!payable) {
      if (skipInvalid) continue;
      badRequest('One or more selected players are not unpaid members of a paid division');
    }

    const seasonId = team.seasonId!;
    const signupCost = division.signupCost;
    const fees = leagueFeeForLine({
      playerSteamId: line.playerSteamId,
      seasonId,
      trackerAmount: trackerMap.get(`${line.playerSteamId}:${seasonId}`) ?? 0,
      seenFirst,
      leagueFees,
    });

    quoted.push({
      teamId: team.id,
      playerSteamId: line.playerSteamId,
      playerName: user.steamUsername,
      playerAvatar: user.steamAvatar,
      teamName: team.name,
      teamAvatar: team.avatar,
      formatName: team.format.name,
      formatThemeKey: team.format.themeKey,
      formatIconUrl: team.format.iconUrl,
      isIndividual: team.format.isIndividual,
      divisionName: division.name,
      regionName: team.region?.name ?? null,
      seasonNum: team.season?.seasonNum ?? null,
      seasonId,
      signupCost,
      leagueFees: fees,
      totalCost: signupCost + fees,
      currency: team.region?.currencyCode ?? 'USD',
      currencySymbol: team.region?.currencySymbol ?? '$',
      itemPaymentConfig: itemConfigFromDivision(division),
    });
  }

  return quoted;
}

export function sumQuotedAmount(lines: { totalCost: number }[]): number {
  const total = lines.reduce((sum, line) => sum + line.totalCost, 0);
  if (total <= 0) badRequest('Payment amount must be greater than zero');
  return total;
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

  const signupCost = playerInTeam.team.division?.signupCost ?? 0;

  if (signupCost > 0) {
    const quoted = await quoteParticipationLines([{ teamId, playerSteamId: steamId }]);
    await recordQuotedSignupPayments({
      payerSteamId: adminSteamId,
      lines: quoted,
      currency: 'MANUAL',
      method: 'manual',
      groupKey: `manual-${Date.now()}-${steamId}`,
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
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

function signupDescription(line: QuotedParticipation): string {
  if (line.itemOrderNumber && line.itemPaymentConfig) {
    return `Item payment - ${line.itemPaymentConfig.itemQuantity}x ${line.itemPaymentConfig.itemName} (Order ${line.itemOrderNumber})`;
  }
  const scope = line.isIndividual
    ? [line.regionName, line.formatName].filter(Boolean).join(' ')
    : line.teamName;
  return `League signup — ${line.playerName} (${scope})`;
}

export async function recordQuotedSignupPayments(options: {
  payerSteamId: string;
  lines: QuotedParticipation[];
  currency: string;
  method: 'paypal' | 'items' | 'manual';
  groupKey: string;
  captureId?: string;
  tradeOfferId?: string;
  itemName?: string | null;
}): Promise<void> {
  const { payerSteamId, lines, currency, method, groupKey } = options;
  if (lines.length === 0) return;

  const payer = await prisma.user.findUnique({
    where: { steamId: payerSteamId },
    select: { steamUsername: true },
  });
  const payerName = payer?.steamUsername ?? payerSteamId;

  const teamIds = [...new Set(lines.map((line) => line.teamId))];
  const teamRecords = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    include: { format: true },
  });
  const teamMap = new Map(teamRecords.map((team) => [team.id, team]));

  await prisma.$transaction(async (tx) => {
    const invoiceRows: RecordedPaymentForInvoice[] = [];
    const touchedTeams = new Set<number>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const pit = await tx.playerInTeam.findUnique({
        where: {
          playerSteamId_teamId: { playerSteamId: line.playerSteamId, teamId: line.teamId },
        },
      });
      if (!pit || pit.paymentStatus !== 0) continue;

      const paymentId =
        method === 'paypal'
          ? `${options.captureId}-${i}`
          : method === 'items'
            ? `${options.tradeOfferId}-${i}`
            : `manual-${Date.now()}-${line.playerSteamId}`;

      await tx.paymentTracker.upsert({
        where: {
          playerSteamId_seasonId: { playerSteamId: line.playerSteamId, seasonId: line.seasonId },
        },
        create: {
          playerSteamId: line.playerSteamId,
          seasonId: line.seasonId,
          amount: line.signupCost,
        },
        update: { amount: { increment: line.signupCost } },
      });

      const amount = method === 'paypal' ? line.totalCost.toFixed(2) : line.signupCost.toString();

      await tx.payment.create({
        data: {
          paymentId,
          paypalCaptureId: options.captureId ?? null,
          purchasedFor: line.playerSteamId,
          purchasedBy: payerSteamId,
          amount,
          currency,
          purchaseDate: new Date(),
          description: signupDescription(line),
          teamId: line.teamId,
        },
      });

      await tx.playerInTeam.update({
        where: {
          playerSteamId_teamId: { playerSteamId: line.playerSteamId, teamId: line.teamId },
        },
        data: { paymentStatus: 1 },
      });

      invoiceRows.push({
        paymentId,
        purchasedBy: payerSteamId,
        purchasedByName: payerName,
        purchasedFor: line.playerSteamId,
        purchasedForName: line.playerName,
        teamId: line.teamId,
        teamName: line.teamName,
        formatName: line.formatName,
        regionName: line.regionName,
        seasonNum: line.seasonNum,
        divisionName: line.divisionName,
        signupCost: line.signupCost,
        leagueFees: line.leagueFees,
        total: method === 'paypal' ? line.totalCost : line.signupCost,
        currency,
        method,
        externalId: options.captureId ?? options.tradeOfferId ?? paymentId,
        itemName: options.itemName ?? line.itemPaymentConfig?.itemName ?? null,
        itemQuantity: line.itemPaymentConfig ? line.itemPaymentConfig.itemQuantity : null,
        internalNote:
          method === 'manual' ? 'Recorded by staff. This is not a player purchase.' : null,
      });
      touchedTeams.add(line.teamId);
    }

    for (const teamId of touchedTeams) {
      const team = teamMap.get(teamId);
      if (!team) continue;
      await syncTeamPaymentStatus(tx, teamId, team.format.requiredPaidPlayers);
    }

    await issueInvoicesForRecordedPayments(tx, invoiceRows, groupKey);
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
  coveredSteamId: string;
  coveredName: string | null;
  payerSteamId: string;
  payerName: string | null;
  invoiceNumber: string | null;
  groupInvoiceNumber: string | null;
  creditNoteNumber: string | null;
  payerHistoryHref: string | null;
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

  const coveredIds = [...new Set(payments.map((payment) => payment.purchasedFor))];
  const namedUsers = coveredIds.length
    ? await prisma.user.findMany({
        where: { steamId: { in: coveredIds } },
        select: { steamId: true, steamUsername: true },
      })
    : [];
  const nameBySteamId = new Map(namedUsers.map((user) => [user.steamId, user.steamUsername]));

  const groupKeys = [
    ...new Set(
      [
        ...payments.map((payment) => payment.paypalCaptureId),
        ...itemOrders.map((order) => order.checkoutGroupId),
      ].filter((key): key is string => Boolean(key)),
    ),
  ];
  const invoiceNumbers = await getInvoiceNumbersForPayments(
    payments.map((payment) => payment.paymentId),
    groupKeys,
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
    let method: PaymentHistoryEntry['method'] = 'paypal';
    if (p.currency === 'ITEMS') method = 'items';
    else if (p.currency === 'MANUAL') method = 'manual';

    const recordedItem = method === 'items' ? parseRecordedItemPayment(p.description ?? '') : null;
    const openRefund =
      method === 'items' && recordedItem
        ? refundByOrder.get(recordedItem.orderNumber)
        : refundByPayment.get(p.paymentId);
    let status: PaymentHistoryEntry['status'] = 'completed';
    let refundable = method === 'paypal' || (method === 'items' && Boolean(recordedItem));
    let refundBlockReason: string | null = null;
    if (method === 'manual') {
      refundable = false;
      refundBlockReason = 'Manual payments are not refunded automatically.';
    } else if (openRefund === 'COMPLETED') {
      status = 'refunded';
      refundable = false;
      refundBlockReason = 'Already refunded.';
    } else if (openRefund === 'PENDING') {
      status = 'refund_pending';
      refundable = false;
      refundBlockReason = 'A refund is already in progress.';
    } else if (method === 'paypal' && Date.now() - p.purchaseDate.getTime() > refundWindowMs) {
      refundable = false;
      refundBlockReason = 'PayPal only allows refunds within 180 days of the payment.';
    } else if (method === 'items' && !hasTradeOfferUrl) {
      refundable = false;
      refundBlockReason = 'This player has not saved a Steam trade offer link.';
    }

    const groupKey = p.paypalCaptureId ?? invoiceNumbers.groupKeyByPayment.get(p.paymentId) ?? null;
    entries.push({
      id: recordedItem?.orderNumber ?? p.paymentId,
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
      coveredSteamId: p.purchasedFor,
      coveredName: nameBySteamId.get(p.purchasedFor) ?? null,
      payerSteamId: p.purchasedBy,
      payerName: null,
      invoiceNumber: invoiceNumbers.lineByPayment.get(p.paymentId) ?? null,
      groupInvoiceNumber: groupKey ? (invoiceNumbers.groupByKey.get(groupKey) ?? null) : null,
      creditNoteNumber: invoiceNumbers.creditByPayment.get(p.paymentId) ?? null,
      payerHistoryHref: null,
    });
  }

  for (const o of itemOrders) {
    if (o.status === 'COMPLETED') continue;
    const statusMap: Record<string, PaymentHistoryEntry['status']> = {
      PENDING: 'pending',
      EXPIRED: 'expired',
      CANCELLED: 'cancelled',
      REFUNDED: 'refunded',
    };
    const openRefund = refundByOrder.get(o.orderNumber);
    let status = statusMap[o.status] ?? 'pending';
    let refundable = false;
    let refundBlockReason: string | null = 'Only a completed item payment can be refunded.';
    if (o.status === 'REFUNDED' || openRefund === 'COMPLETED') {
      status = 'refunded';
      refundBlockReason = 'Already refunded.';
    } else if (openRefund === 'PENDING') {
      status = 'refund_pending';
      refundBlockReason = 'A refund is already in progress.';
    }

    const targets = o.paidForSteamIds.length > 0 ? o.paidForSteamIds : [o.playerSteamId];
    const iconFromHash = iconByHash.get(o.itemMarketHashName);
    const coveredSteamId = targets[0] ?? o.playerSteamId;
    entries.push({
      id: o.orderNumber,
      date: o.createdAt,
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
      coveredSteamId,
      coveredName: nameBySteamId.get(coveredSteamId) ?? null,
      payerSteamId: o.playerSteamId,
      payerName: null,
      invoiceNumber: null,
      groupInvoiceNumber: o.checkoutGroupId
        ? (invoiceNumbers.groupByKey.get(o.checkoutGroupId) ?? null)
        : null,
      creditNoteNumber: null,
      payerHistoryHref: null,
    });
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  const total = entries.length;
  const start = (page - 1) * limit;
  const paginated = entries.slice(start, start + limit);

  return { entries: paginated, total };
}

export async function getCoveredPaymentHistory(steamId: string): Promise<PaymentHistoryEntry[]> {
  const payments = await prisma.payment.findMany({
    where: { purchasedFor: steamId, purchasedBy: { not: steamId } },
    include: {
      team: { select: historyTeamSelect },
      byUser: { select: { steamId: true, steamUsername: true } },
    },
    orderBy: { purchaseDate: 'desc' },
  });
  if (payments.length === 0) return [];

  const refunds = await prisma.paymentRefund.findMany({
    where: {
      paymentId: { in: payments.map((payment) => payment.paymentId) },
      status: { in: ['PENDING', 'COMPLETED'] },
    },
    select: { paymentId: true, status: true },
  });
  const refundByPayment = new Map(
    refunds.filter((row) => row.paymentId).map((row) => [row.paymentId as string, row.status]),
  );
  const groupKeys = [
    ...new Set(
      payments
        .map((payment) => payment.paypalCaptureId)
        .filter((key): key is string => Boolean(key)),
    ),
  ];
  const invoiceNumbers = await getInvoiceNumbersForPayments(
    payments.map((payment) => payment.paymentId),
    groupKeys,
  );

  const rosterKeys = payments
    .filter((payment) => payment.teamId)
    .map((payment) => `${payment.teamId}:${payment.purchasedFor}`);
  const roster = rosterKeys.length
    ? await prisma.playerInTeam.findMany({
        where: {
          active: 1,
          OR: rosterKeys.map((key) => {
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

  const steamItems = await prisma.steamItem.findMany({
    select: { name: true, iconUrl: true },
  });
  const iconByName = new Map(steamItems.map((item) => [item.name, item.iconUrl]));

  return payments.map((p) => {
    let method: PaymentHistoryEntry['method'] = 'paypal';
    if (p.currency === 'ITEMS') method = 'items';
    else if (p.currency === 'MANUAL') method = 'manual';

    const recordedItem = method === 'items' ? parseRecordedItemPayment(p.description ?? '') : null;
    const openRefund = refundByPayment.get(p.paymentId);
    let status: PaymentHistoryEntry['status'] = 'completed';
    let refundable = method === 'paypal';
    let refundBlockReason: string | null = null;
    if (method === 'manual') {
      refundable = false;
      refundBlockReason = 'Manual payments are not refunded automatically.';
    } else if (method === 'items') {
      refundable = Boolean(recordedItem) && !openRefund;
      refundBlockReason = recordedItem ? null : 'This item payment cannot be refunded from here.';
    } else if (openRefund === 'COMPLETED') {
      status = 'refunded';
      refundable = false;
      refundBlockReason = 'Already refunded.';
    } else if (openRefund === 'PENDING') {
      status = 'refund_pending';
      refundable = false;
      refundBlockReason = 'A refund is already in progress.';
    }

    const groupKey = p.paypalCaptureId ?? invoiceNumbers.groupKeyByPayment.get(p.paymentId) ?? null;
    return {
      id: recordedItem?.orderNumber ?? p.paymentId,
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
      coveredSteamId: p.purchasedFor,
      coveredName: null,
      payerSteamId: p.purchasedBy,
      payerName: p.byUser.steamUsername,
      invoiceNumber: invoiceNumbers.lineByPayment.get(p.paymentId) ?? null,
      groupInvoiceNumber: groupKey ? (invoiceNumbers.groupByKey.get(groupKey) ?? null) : null,
      creditNoteNumber: invoiceNumbers.creditByPayment.get(p.paymentId) ?? null,
      payerHistoryHref: `/users/${p.purchasedBy}?tab=payments`,
    };
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
