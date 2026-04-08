/**
 * Map Files Service
 *
 * Handles upload, retrieval, and deletion of MGE map download packages.
 * Each entry bundles a .bsp map file with its .cfg spawn config, plus an optional thumbnail.
 */

import { prisma } from '$lib/server/db';
import {
  uploadBufferToR2,
  deleteFromR2,
  validateUploadedFile,
  saveTempFile,
  deleteTempFile,
  getPublicUrl,
} from '$lib/server/utils/r2Upload';
import { notFound, badRequest } from '$lib/server/utils/errors';
import path from 'path';
import fs from 'fs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MapFileRow {
  id: number;
  name: string;
  bspUrl: string;
  bspSize: bigint;
  cfgUrl: string;
  cfgSize: bigint;
  thumbnailUrl: string | null;
  description: string | null;
  uploadedBy: string;
  uploaderName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MapFileSummary {
  id: number;
  name: string;
  bspUrl: string;
  bspSizeBytes: number;
  cfgUrl: string;
  cfgSizeBytes: number;
  thumbnailUrl: string | null;
  description: string | null;
  createdAt: string;
}

// ─── R2 key helpers ───────────────────────────────────────────────────────────

function bspKey(name: string) {
  return `maps/${name}.bsp`;
}

function cfgKey(name: string) {
  return `maps/configs/${name}.cfg`;
}

function thumbnailKey(name: string, ext: string) {
  return `maps/thumbnails/${name}${ext}`;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Check whether a given canonical map name is already taken.
 * Used by the presign endpoint to validate before issuing a URL.
 */
export async function isMapNameTaken(name: string): Promise<boolean> {
  const existing = await prisma.mapFile.findUnique({ where: { name } });
  return existing !== null;
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
    bspSize: m.bspSize,
    cfgUrl: m.cfgUrl,
    cfgSize: m.cfgSize,
    thumbnailUrl: m.thumbnailUrl,
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

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createMapFile(params: {
  bspFile: File;
  cfgFile: File;
  thumbnailFile?: File | null;
  description?: string | null;
  uploadedBy: string;
}) {
  const { bspFile, cfgFile, thumbnailFile, description, uploadedBy } = params;

  // Validate files
  validateUploadedFile(bspFile, 'bsp');
  validateUploadedFile(cfgFile, 'cfg');
  if (thumbnailFile) validateUploadedFile(thumbnailFile, 'image');

  // Derive the canonical map name from the BSP filename (strip extension)
  const rawName = path.basename(bspFile.name, '.bsp').toLowerCase().trim();
  if (!rawName) badRequest('Could not derive map name from BSP filename');

  // Enforce mge_ prefix convention
  if (!rawName.startsWith('mge_')) {
    badRequest('Map filename must start with mge_ (e.g. mge_chillypunch_final4.bsp)');
  }

  // Check for duplicate name
  const existing = await prisma.mapFile.findUnique({ where: { name: rawName } });
  if (existing) badRequest(`A map named "${rawName}" already exists`);

  // Save temp files and read buffers
  const bspTempPath = await saveTempFile(bspFile);
  const cfgTempPath = await saveTempFile(cfgFile);
  let thumbnailTempPath: string | null = null;

  try {
    const bspBuffer = fs.readFileSync(bspTempPath);
    const cfgBuffer = fs.readFileSync(cfgTempPath);

    // Upload BSP
    const bspUrl = await uploadBufferToR2(bspBuffer, bspKey(rawName), 'application/octet-stream');
    if (!bspUrl) badRequest('R2 storage is not configured — cannot upload map files');

    // Upload CFG
    const cfgUrl = await uploadBufferToR2(cfgBuffer, cfgKey(rawName), 'text/plain');
    if (!cfgUrl) badRequest('R2 storage is not configured — cannot upload config files');

    // Upload thumbnail (optional)
    let thumbUrl: string | null = null;
    if (thumbnailFile) {
      thumbnailTempPath = await saveTempFile(thumbnailFile);
      const thumbBuffer = fs.readFileSync(thumbnailTempPath);
      const thumbExt = path.extname(thumbnailFile.name).toLowerCase();
      thumbUrl = await uploadBufferToR2(
        thumbBuffer,
        thumbnailKey(rawName, thumbExt),
        thumbnailFile.type || 'image/jpeg',
      );
    }

    // bspUrl and cfgUrl are guaranteed non-null here: badRequest throws above
    return await prisma.mapFile.create({
      data: {
        name: rawName,
        bspUrl: bspUrl as string,
        bspSize: BigInt(bspFile.size),
        cfgUrl: cfgUrl as string,
        cfgSize: BigInt(cfgFile.size),
        thumbnailUrl: thumbUrl,
        description: description?.trim() || null,
        uploadedBy,
      },
    });
  } finally {
    deleteTempFile(bspTempPath);
    deleteTempFile(cfgTempPath);
    if (thumbnailTempPath) deleteTempFile(thumbnailTempPath);
  }
}

/**
 * Create a MapFile record after the BSP has already been uploaded directly to R2
 * via a presigned PUT URL. CFG and thumbnail are still uploaded through the server
 * (they are small enough to pass through Cloudflare without issue).
 */
export async function createMapFileFromPresigned(params: {
  bspKey: string;
  bspSize: number;
  cfgFile: File;
  thumbnailFile?: File | null;
  description?: string | null;
  uploadedBy: string;
}) {
  const { bspKey: bspR2Key, bspSize, cfgFile, thumbnailFile, description, uploadedBy } = params;

  // Derive canonical map name from the BSP key (e.g. "maps/mge_foo.bsp" → "mge_foo")
  const keyBasename = path.basename(bspR2Key, '.bsp'); // "mge_foo"
  const rawName = keyBasename.toLowerCase().trim();
  if (!rawName) badRequest('Could not derive map name from bspKey');

  // Validate CFG + optional thumbnail (BSP was already validated at presign time)
  validateUploadedFile(cfgFile, 'cfg');
  if (thumbnailFile) validateUploadedFile(thumbnailFile, 'image');

  // Verify the map name was not claimed between presign and finalize
  const existing = await prisma.mapFile.findUnique({ where: { name: rawName } });
  if (existing) badRequest(`A map named "${rawName}" already exists`);

  // Build the public BSP URL from the key
  const bspUrl = getPublicUrl(bspR2Key);
  if (!bspUrl) badRequest('R2 storage is not configured — cannot create map record');

  // Upload CFG through server
  const cfgTempPath = await saveTempFile(cfgFile);
  let thumbnailTempPath: string | null = null;

  try {
    const cfgBuffer = fs.readFileSync(cfgTempPath);
    const cfgUrl = await uploadBufferToR2(cfgBuffer, cfgKey(rawName), 'text/plain');
    if (!cfgUrl) badRequest('R2 storage is not configured — cannot upload config file');

    // Upload thumbnail (optional)
    let thumbUrl: string | null = null;
    if (thumbnailFile) {
      thumbnailTempPath = await saveTempFile(thumbnailFile);
      const thumbBuffer = fs.readFileSync(thumbnailTempPath);
      const thumbExt = path.extname(thumbnailFile.name).toLowerCase();
      thumbUrl = await uploadBufferToR2(
        thumbBuffer,
        thumbnailKey(rawName, thumbExt),
        thumbnailFile.type || 'image/jpeg',
      );
    }

    return await prisma.mapFile.create({
      data: {
        name: rawName,
        bspUrl: bspUrl as string,
        bspSize: BigInt(bspSize),
        cfgUrl: cfgUrl as string,
        cfgSize: BigInt(cfgFile.size),
        thumbnailUrl: thumbUrl,
        description: description?.trim() || null,
        uploadedBy,
      },
    });
  } finally {
    deleteTempFile(cfgTempPath);
    if (thumbnailTempPath) deleteTempFile(thumbnailTempPath);
  }
}

export async function updateMapFileDescription(
  id: number,
  description: string | null,
): Promise<void> {
  const m = await prisma.mapFile.findUnique({ where: { id } });
  if (!m) notFound('Map not found');

  await prisma.mapFile.update({
    where: { id },
    data: { description: description?.trim() || null },
  });
}

export async function deleteMapFile(id: number): Promise<void> {
  const m = await prisma.mapFile.findUnique({ where: { id } });
  if (!m) notFound('Map not found');

  // Remove files from R2 (best-effort — don't fail if already gone)
  await deleteFromR2(bspKey(m.name));
  await deleteFromR2(cfgKey(m.name));
  if (m.thumbnailUrl) {
    // Derive key from URL by stripping the base URL prefix
    const thumbKey = m.thumbnailUrl.replace(/^https?:\/\/[^/]+\//, '');
    await deleteFromR2(thumbKey);
  }

  await prisma.mapFile.delete({ where: { id } });
}
