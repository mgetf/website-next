import { prisma } from '$lib/server/db';
import { notFound, badRequest } from '$lib/server/utils/errors';

export async function getSteamItems() {
  return await prisma.steamItem.findMany({
    orderBy: { name: 'asc' },
  });
}

export async function getSteamItemById(id: number) {
  return await prisma.steamItem.findUnique({ where: { id } });
}

export async function createSteamItem(data: {
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl?: string | null;
}) {
  const trimmedName = data.name.trim();
  const trimmedHash = data.marketHashName.trim();

  if (!trimmedName) {
    badRequest('Item name is required');
  }

  if (!trimmedHash) {
    badRequest('Market hash name is required');
  }

  if (data.appId < 1) {
    badRequest('App ID must be a positive integer');
  }

  const existing = await prisma.steamItem.findUnique({
    where: { marketHashName: trimmedHash },
  });

  if (existing) {
    badRequest(`An item with market hash name "${trimmedHash}" already exists`);
  }

  return await prisma.steamItem.create({
    data: {
      name: trimmedName,
      appId: data.appId,
      marketHashName: trimmedHash,
      iconUrl: data.iconUrl ?? null,
    },
  });
}

export async function updateSteamItem(
  id: number,
  data: { name?: string; iconUrl?: string | null },
) {
  const item = await prisma.steamItem.findUnique({ where: { id } });

  if (!item) {
    notFound('Steam item not found');
  }

  const updateData: { name?: string; iconUrl?: string | null } = {};

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) {
      badRequest('Item name is required');
    }
    updateData.name = trimmed;
  }

  if (data.iconUrl !== undefined) {
    updateData.iconUrl = data.iconUrl;
  }

  return await prisma.steamItem.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteSteamItem(id: number) {
  const item = await prisma.steamItem.findUnique({
    where: { id },
    include: { _count: { select: { divisionItemPayments: true } } },
  });

  if (!item) {
    notFound('Steam item not found');
  }

  if (item._count.divisionItemPayments > 0) {
    badRequest(
      `Cannot delete: this item is used by ${item._count.divisionItemPayments} division(s)`,
    );
  }

  return await prisma.steamItem.delete({ where: { id } });
}
