/**
 * Map Files Service
 *
 * Handles upload, retrieval, and deletion of MGE map download packages.
 * Each entry bundles a .bsp map file with its .cfg spawn config.
 */

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

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Check whether a given canonical map name is already taken.
 * Used by the presign endpoint to validate before issuing a URL.
 */
export async function isMapNameTaken(name: string): Promise<boolean> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void name;
    return false;
  }
  throw new Error('isMapNameTaken requires DATA_BACKEND=rama');
}

export async function getMapFiles(): Promise<MapFileRow[]> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return [];
  throw new Error('getMapFiles requires DATA_BACKEND=rama');
}

export async function getMapFileById(id: number): Promise<MapFileRow> {
  void id;
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) notFound('Map not found');
  throw new Error('getMapFileById requires DATA_BACKEND=rama');
}

export async function getMapFilesByIds(
  ids: number[],
): Promise<Array<{ id: number; name: string; bspUrl: string; cfgUrl: string }>> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    void ids;
    return [];
  }
  throw new Error('getMapFilesByIds requires DATA_BACKEND=rama');
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function assertMapsWritable() {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('Map file mutations are not available under DATA_BACKEND=rama yet');
  }
}

export async function createMapFile(params: {
  bspFile: File;
  cfgFile: File;
  description?: string | null;
  uploadedBy: string;
}): Promise<MapFileRow> {
  void params;
  throw new Error('createMapFile is not available under Rama');
}

/**
 * Create a MapFile record after the BSP has already been uploaded directly to R2
 * via a presigned PUT URL. CFG is still uploaded through the server
 * (it is small enough to pass through Cloudflare without issue).
 */
export async function createMapFileFromPresigned(params: {
  bspKey: string;
  bspSize: number;
  cfgFile: File;
  description?: string | null;
  uploadedBy: string;
}): Promise<MapFileRow> {
  void params;
  throw new Error('createMapFileFromPresigned is not available under Rama');
}

export async function updateMapFileDescription(
  id: number,
  description: string | null,
): Promise<void> {
  throw new Error('updateMapFileDescription is not available under Rama');
}

export async function deleteMapFile(id: number): Promise<void> {
  throw new Error('deleteMapFile is not available under Rama');
}
