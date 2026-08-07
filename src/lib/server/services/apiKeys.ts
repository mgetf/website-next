/**
 * API Key Service
 *
 * CRUD operations and validation for service-to-service API keys.
 * Secrets are stored as SHA-256 hashes; plaintext is returned only once at creation.
 */

import { createHash, randomBytes } from 'crypto';
import { prisma } from '$lib/server/db';

export type ApiKeyRecord = {
  id: number;
  name: string;
  keyPrefix: string;
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

export type CreatedApiKey = ApiKeyRecord & {
  /** Plaintext secret — shown once at creation, never stored. */
  key: string;
};

/**
 * Hash an API key for at-rest storage / lookup.
 * Exported for unit tests and migrations.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function maskApiKeyPrefix(keyPrefix: string): string {
  if (keyPrefix.startsWith('mge_') && keyPrefix.length >= 8) {
    return `${keyPrefix}…`;
  }
  return 'mge_••••••••';
}

function toApiKeyRecord(record: {
  id: number;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  createdBy: string;
  creator: { steamUsername: string };
}): ApiKeyRecord {
  return {
    id: record.id,
    name: record.name,
    keyPrefix: record.keyPrefix,
    active: record.active,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    createdBy: record.createdBy,
    creator: record.creator,
  };
}

/**
 * Generate and store a new API key.
 * Keys use the format: mge_<64 random hex chars>
 * Only the SHA-256 hash is persisted.
 */
export async function createApiKey(name: string, createdBy: string): Promise<CreatedApiKey> {
  const key = `mge_${randomBytes(32).toString('hex')}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.slice(0, 8);

  const record = await prisma.apiKey.create({
    data: { name, keyHash, keyPrefix, createdBy },
    include: { creator: { select: { steamUsername: true } } },
  });

  return { ...toApiKeyRecord(record), key };
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

  return keys.map((record) => ({
    ...toApiKeyRecord(record),
    keyPreview: maskApiKeyPrefix(record.keyPrefix),
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
  if (!key || key.length < 12) return null;

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    include: { creator: { select: { steamUsername: true } } },
  });

  if (!record || !record.active) return null;

  // Fire-and-forget lastUsedAt update — never block the request
  prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return toApiKeyRecord(record);
}
