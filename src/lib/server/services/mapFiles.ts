/**
 * Map catalog service.
 *
 * Each entry is a named pair of external URLs (.bsp + .cfg). The download
 * endpoint fetches those URLs and zips them into the TF2 directory layout.
 */

import { prisma } from '$lib/server/db';
import { notFound, badRequest, conflict } from '$lib/server/utils/errors';
import { isPrismaLikeError } from '$lib/server/utils/prisma-errors';
import { assertPublicHttpsUrl, PublicHttpsUrlError } from '$lib/server/utils/publicHttpsUrl';

export const MAP_NAME_PATTERN = /^[a-z0-9_]+$/;

export interface MapFileRow {
  id: number;
  name: string;
  bspUrl: string;
  cfgUrl: string;
  description: string | null;
  uploadedBy: string;
  uploaderName: string;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizeMapName(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (!name) badRequest('Map name is required');
  if (!MAP_NAME_PATTERN.test(name)) {
    badRequest('Map name may only contain lowercase letters, numbers, and underscores');
  }
  return name;
}

async function requirePublicHttpsUrl(raw: string, label: string): Promise<string> {
  try {
    const url = await assertPublicHttpsUrl(raw);
    return url.href;
  } catch (err) {
    if (err instanceof PublicHttpsUrlError) {
      badRequest(`${label}: ${err.message}`);
    }
    throw err;
  }
}

export async function getMapFiles(): Promise<MapFileRow[]> {
  const maps = await prisma.mapFile.findMany({
    include: { uploader: { select: { steamUsername: true } } },
    orderBy: { name: 'asc' },
  });

  return maps.map((m) => ({
    id: m.id,
    name: m.name,
    bspUrl: m.bspUrl,
    cfgUrl: m.cfgUrl,
    description: m.description,
    uploadedBy: m.uploadedBy,
    uploaderName: m.uploader.steamUsername,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));
}

export async function getMapFileById(id: number) {
  const m = await prisma.mapFile.findUnique({
    where: { id },
    include: { uploader: { select: { steamUsername: true } } },
  });
  if (!m) notFound('Map not found');
  return m!;
}

export async function getMapFilesByIds(ids: number[]) {
  return await prisma.mapFile.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      bspUrl: true,
      cfgUrl: true,
    },
  });
}

export async function createMapFile(params: {
  name: string;
  bspUrl: string;
  cfgUrl: string;
  description?: string | null;
  uploadedBy: string;
}) {
  const name = normalizeMapName(params.name);
  const bspUrl = await requirePublicHttpsUrl(params.bspUrl, '.bsp URL');
  const cfgUrl = await requirePublicHttpsUrl(params.cfgUrl, '.cfg URL');
  const description = params.description?.trim() || null;

  try {
    return await prisma.mapFile.create({
      data: {
        name,
        bspUrl,
        cfgUrl,
        description,
        uploadedBy: params.uploadedBy,
      },
    });
  } catch (err) {
    if (isPrismaLikeError(err) && err.code === 'P2002') {
      conflict(`A map named "${name}" already exists`);
    }
    throw err;
  }
}

export async function updateMapFile(params: {
  id: number;
  name: string;
  bspUrl: string;
  cfgUrl: string;
  description?: string | null;
}) {
  const existing = await prisma.mapFile.findUnique({ where: { id: params.id } });
  if (!existing) notFound('Map not found');

  const name = normalizeMapName(params.name);
  const bspUrl = await requirePublicHttpsUrl(params.bspUrl, '.bsp URL');
  const cfgUrl = await requirePublicHttpsUrl(params.cfgUrl, '.cfg URL');
  const description = params.description?.trim() || null;

  try {
    return await prisma.mapFile.update({
      where: { id: params.id },
      data: { name, bspUrl, cfgUrl, description },
    });
  } catch (err) {
    if (isPrismaLikeError(err) && err.code === 'P2002') {
      conflict(`A map named "${name}" already exists`);
    }
    throw err;
  }
}

export async function deleteMapFile(id: number): Promise<void> {
  const m = await prisma.mapFile.findUnique({ where: { id } });
  if (!m) notFound('Map not found');

  await prisma.mapFile.delete({ where: { id } });
}
