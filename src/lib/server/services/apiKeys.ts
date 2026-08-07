/**
 * API Key Service
 *
 * CRUD operations and validation for service-to-service API keys.
 */

import { randomBytes } from 'crypto';
import { prisma } from '$lib/server/db';

export type ApiKeyRecord = {
  id: number;
  name: string;
  key: string;
  active: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  createdBy: string;
  creator: { steamUsername: string };
};

/** List shape for admin UI — never includes the full secret. */
export type ApiKeyListItem = {
  id: number;
  name: string;
  keyPreview: string;
  active: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  createdBy: string;
  creator: { steamUsername: string };
};

function maskApiKey(key: string): string {
  if (key.startsWith('mge_') && key.length > 12) {
    const body = key.slice(4);
    return `mge_${body.slice(0, 4)}…${body.slice(-4)}`;
  }
  return 'mge_••••••••';
}

/**
 * Generate and store a new API key.
 * Keys use the format: mge_<64 random hex chars>
 */
export async function createApiKey(name: string, createdBy: string): Promise<ApiKeyRecord> {
  const key = `mge_${randomBytes(32).toString('hex')}`;
  return await prisma.apiKey.create({
    data: { name, key, createdBy },
    include: { creator: { select: { steamUsername: true } } },
  });
}

/**
 * List all API keys for admin display, newest first.
 * Full key values are never returned — only a short preview.
 */
export async function getApiKeys(): Promise<ApiKeyListItem[]> {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { steamUsername: true } } },
  });

  return keys.map(({ key, ...rest }) => ({
    ...rest,
    keyPreview: maskApiKey(key),
  }));
}

/**
 * Enable or disable an API key without deleting it.
 */
export async function toggleApiKey(id: number, active: boolean): Promise<void> {
  await prisma.apiKey.update({ where: { id }, data: { active } });
}

/**
 * Permanently delete an API key.
 */
export async function deleteApiKey(id: number): Promise<void> {
  await prisma.apiKey.delete({ where: { id } });
}

/**
 * Validate an inbound API key string.
 * Updates lastUsedAt on success and returns the key record.
 * Returns null if the key does not exist or is inactive.
 */
export async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  const record = await prisma.apiKey.findUnique({
    where: { key },
    include: { creator: { select: { steamUsername: true } } },
  });

  if (!record || !record.active) return null;

  // Fire-and-forget lastUsedAt update — never block the request
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return record;
}
