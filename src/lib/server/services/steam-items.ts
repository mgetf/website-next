import { prisma } from '$lib/server/db';
import { notFound, badRequest } from '$lib/server/utils/errors';
import {
  deleteFromR2,
  deleteTempFile,
  extensionForImageMime,
  isR2Available,
  saveTempFile,
  uploadToR2,
  validateUploadedFile,
} from '$lib/server/utils/r2Upload';

export type SteamItemRecord = {
  id: number;
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl: string | null;
};

function toSteamItemRecord(item: {
  id: number;
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl: string | null;
}): SteamItemRecord {
  return {
    id: item.id,
    name: item.name,
    appId: item.appId,
    marketHashName: item.marketHashName,
    iconUrl: item.iconUrl,
  };
}

function isManagedSteamItemIcon(url: string): boolean {
  try {
    return new URL(url).pathname.includes('/images/steam-items/');
  } catch {
    return false;
  }
}

async function deleteManagedSteamItemIcon(url: string | null): Promise<void> {
  if (!url || !isManagedSteamItemIcon(url)) return;
  try {
    const key = new URL(url).pathname.replace(/^\//, '');
    if (key) await deleteFromR2(key);
  } catch {
    // Ignore invalid stored URLs
  }
}

export function steamItemIconFileFromFormData(formData: FormData): File | null {
  const file = formData.get('icon');
  if (file instanceof File && file.size > 0) return file;
  return null;
}

export async function getSteamItems(): Promise<SteamItemRecord[]> {
  const items = await prisma.steamItem.findMany({
    orderBy: { name: 'asc' },
  });
  return items.map(toSteamItemRecord);
}

export async function createSteamItem(data: {
  name: string;
  appId: number;
  marketHashName: string;
  iconUrl?: string | null;
}): Promise<SteamItemRecord> {
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

  const item = await prisma.steamItem.create({
    data: {
      name: trimmedName,
      appId: data.appId,
      marketHashName: trimmedHash,
      iconUrl: data.iconUrl ?? null,
    },
  });

  return toSteamItemRecord(item);
}

export async function updateSteamItem(
  id: number,
  data: { name?: string; iconUrl?: string | null },
): Promise<SteamItemRecord> {
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

  const updated = await prisma.steamItem.update({
    where: { id },
    data: updateData,
  });

  return toSteamItemRecord(updated);
}

export async function uploadSteamItemIcon(id: number, file: File): Promise<SteamItemRecord> {
  const item = await prisma.steamItem.findUnique({ where: { id } });

  if (!item) {
    notFound('Steam item not found');
  }

  if (!isR2Available()) {
    badRequest('File storage is not configured');
  }

  validateUploadedFile(file, 'image');

  const tempPath = await saveTempFile(file);
  try {
    const ext = extensionForImageMime(file.type).replace(/^\./, '');
    const remotePath = `steam-items/${id}-${Date.now()}.${ext}`;
    const publicUrl = await uploadToR2(tempPath, remotePath);
    if (!publicUrl) {
      badRequest('Failed to upload item icon');
    }
    await deleteManagedSteamItemIcon(item.iconUrl);
    return await updateSteamItem(id, { iconUrl: publicUrl });
  } finally {
    deleteTempFile(tempPath);
  }
}

export async function clearSteamItemIcon(id: number): Promise<SteamItemRecord> {
  const item = await prisma.steamItem.findUnique({ where: { id } });

  if (!item) {
    notFound('Steam item not found');
  }

  await deleteManagedSteamItemIcon(item.iconUrl);
  return await updateSteamItem(id, { iconUrl: null });
}

export async function deleteSteamItem(id: number): Promise<SteamItemRecord> {
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

  await deleteManagedSteamItemIcon(item.iconUrl);
  const deleted = await prisma.steamItem.delete({ where: { id } });
  return toSteamItemRecord(deleted);
}
