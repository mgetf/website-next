import { Prisma } from '#prisma/client.js';
import { prisma } from '#lib/server/db.js';
import { badRequest, conflict, notFound } from '#lib/server/utils/errors.js';
import type { CartLineView, QuotedParticipation } from '#lib/types/cart.js';
import { quoteParticipationLines } from './payments.js';

export const CART_HOLD_MS = 30 * 60 * 1000;

export async function getCartCount(steamId: string): Promise<number> {
  const cart = await prisma.cart.findUnique({
    where: { steamId },
    select: { _count: { select: { lines: true } } },
  });
  return cart?._count.lines ?? 0;
}

export async function getCartPlayerIdsForTeam(steamId: string, teamId: number): Promise<string[]> {
  const cart = await prisma.cart.findUnique({
    where: { steamId },
    select: {
      lines: { where: { teamId }, select: { playerSteamId: true } },
    },
  });
  return cart?.lines.map((line) => line.playerSteamId) ?? [];
}

async function getOrCreateCart(steamId: string) {
  return prisma.cart.upsert({
    where: { steamId },
    update: {},
    create: { steamId },
  });
}

export async function addToCart(
  payerSteamId: string,
  teamId: number,
  playerSteamId: string,
): Promise<{ added: boolean }> {
  const quoted = await quoteParticipationLines([{ teamId, playerSteamId }]);
  if (quoted.length === 0) badRequest('That participation is not available to pay');

  const cart = await getOrCreateCart(payerSteamId);
  try {
    await prisma.cartLine.create({
      data: { cartId: cart.id, teamId, playerSteamId },
    });
    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    return { added: true };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { added: false };
    }
    throw err;
  }
}

export async function addUnpaidTeamToCart(
  payerSteamId: string,
  teamId: number,
): Promise<{ added: number }> {
  const unpaid = await prisma.playerInTeam.findMany({
    where: { teamId, active: 1, paymentStatus: 0 },
    select: { playerSteamId: true },
  });
  let added = 0;
  for (const row of unpaid) {
    const result = await addToCart(payerSteamId, teamId, row.playerSteamId);
    if (result.added) added += 1;
  }
  if (added === 0 && unpaid.length === 0) {
    badRequest('There are no unpaid players on this team');
  }
  return { added };
}

export async function removeFromCart(payerSteamId: string, lineId: number): Promise<void> {
  const line = await prisma.cartLine.findFirst({
    where: { id: lineId, cart: { steamId: payerSteamId } },
  });
  if (!line) notFound('Cart item not found');
  await prisma.cartLine.delete({ where: { id: line.id } });
}

export async function expireCartReservations(): Promise<number> {
  const result = await prisma.cartReservation.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

export async function getCartQuote(payerSteamId: string): Promise<CartLineView[]> {
  await expireCartReservations();

  const cart = await prisma.cart.findUnique({
    where: { steamId: payerSteamId },
    include: { lines: { orderBy: { addedAt: 'asc' } } },
  });
  if (!cart || cart.lines.length === 0) return [];

  const quoted = await quoteParticipationLines(
    cart.lines.map((line) => ({ teamId: line.teamId, playerSteamId: line.playerSteamId })),
    { skipInvalid: true },
  );
  const quotedKeys = new Set(quoted.map((row) => `${row.teamId}:${row.playerSteamId}`));
  const staleIds = cart.lines
    .filter((line) => !quotedKeys.has(`${line.teamId}:${line.playerSteamId}`))
    .map((line) => line.id);
  if (staleIds.length > 0) {
    await prisma.cartLine.deleteMany({ where: { id: { in: staleIds } } });
  }

  const liveLines = cart.lines.filter((line) =>
    quotedKeys.has(`${line.teamId}:${line.playerSteamId}`),
  );
  const holds = await prisma.cartReservation.findMany({
    where: {
      OR: liveLines.map((line) => ({ teamId: line.teamId, playerSteamId: line.playerSteamId })),
    },
  });
  const holdMap = new Map(
    holds.map((row) => [`${row.teamId}:${row.playerSteamId}`, row.payerSteamId]),
  );
  const quotedByKey = new Map(quoted.map((row) => [`${row.teamId}:${row.playerSteamId}`, row]));

  return liveLines.flatMap((line) => {
    const row = quotedByKey.get(`${line.teamId}:${line.playerSteamId}`);
    if (!row) return [];
    const holder = holdMap.get(`${line.teamId}:${line.playerSteamId}`);
    return [
      {
        id: line.id,
        ...row,
        reservedByOther: Boolean(holder && holder !== payerSteamId),
      },
    ];
  });
}

export async function reserveCartLines(
  payerSteamId: string,
  lineIds: number[],
): Promise<QuotedParticipation[]> {
  if (lineIds.length === 0) badRequest('Select at least one cart item');
  await expireCartReservations();

  const cart = await prisma.cart.findUnique({
    where: { steamId: payerSteamId },
    include: { lines: { where: { id: { in: lineIds } } } },
  });
  if (!cart || cart.lines.length !== lineIds.length) {
    badRequest('One or more cart items were not found');
  }

  const quoted = await quoteParticipationLines(
    cart.lines.map((line) => ({ teamId: line.teamId, playerSteamId: line.playerSteamId })),
  );

  const currencies = new Set(quoted.map((row) => row.currency));
  if (currencies.size > 1) {
    badRequest('Cannot checkout items with different currencies in one payment');
  }

  const expiresAt = new Date(Date.now() + CART_HOLD_MS);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cartReservation.deleteMany({
        where: { payerSteamId, expiresAt: { lt: new Date() } },
      });

      for (const line of cart.lines) {
        const existing = await tx.cartReservation.findUnique({
          where: {
            teamId_playerSteamId: { teamId: line.teamId, playerSteamId: line.playerSteamId },
          },
        });
        if (existing && existing.payerSteamId !== payerSteamId) {
          conflict('Someone else is already paying for one of these players');
        }
        if (existing) {
          await tx.cartReservation.update({
            where: { id: existing.id },
            data: { expiresAt },
          });
        } else {
          await tx.cartReservation.create({
            data: {
              payerSteamId,
              teamId: line.teamId,
              playerSteamId: line.playerSteamId,
              expiresAt,
            },
          });
        }
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      conflict('Someone else is already paying for one of these players');
    }
    throw err;
  }

  return quoted;
}

export async function getReservedQuote(payerSteamId: string): Promise<QuotedParticipation[]> {
  await expireCartReservations();
  const holds = await prisma.cartReservation.findMany({
    where: { payerSteamId, expiresAt: { gt: new Date() } },
  });
  if (holds.length === 0) badRequest('No reserved cart items to charge');
  return quoteParticipationLines(
    holds.map((row) => ({ teamId: row.teamId, playerSteamId: row.playerSteamId })),
  );
}

export async function releaseCartReservations(payerSteamId: string): Promise<void> {
  await prisma.cartReservation.deleteMany({ where: { payerSteamId } });
}

export async function finalizePaidCartLines(
  payerSteamId: string,
  paid: { teamId: number; playerSteamId: string }[],
): Promise<void> {
  if (paid.length === 0) {
    await releaseCartReservations(payerSteamId);
    return;
  }
  const cart = await prisma.cart.findUnique({ where: { steamId: payerSteamId } });
  await prisma.$transaction(async (tx) => {
    if (cart) {
      await tx.cartLine.deleteMany({
        where: {
          cartId: cart.id,
          OR: paid.map((row) => ({ teamId: row.teamId, playerSteamId: row.playerSteamId })),
        },
      });
    }
    await tx.cartReservation.deleteMany({
      where: {
        payerSteamId,
        OR: paid.map((row) => ({ teamId: row.teamId, playerSteamId: row.playerSteamId })),
      },
    });
  });
}
