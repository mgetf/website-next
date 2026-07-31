/**
 * API Key Service
 *
 * CRUD operations and validation for service-to-service API keys.
 */

import { randomBytes } from 'crypto';
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
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('API keys are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('createApiKey requires DATA_BACKEND=rama');
}

/**
 * List all API keys for admin display, newest first.
 * Full key values are never returned — only a short preview.
 */
export async function getApiKeys(): Promise<ApiKeyListItem[]> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) return [];
  throw new Error('getApiKeys requires DATA_BACKEND=rama');
}

/**
 * Enable or disable an API key without deleting it.
 */
export async function toggleApiKey(id: number, active: boolean): Promise<void> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('API keys are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('toggleApiKey requires DATA_BACKEND=rama');
}

/**
 * Permanently delete an API key.
 */
export async function deleteApiKey(id: number): Promise<void> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    throw new Error('API keys are not available under DATA_BACKEND=rama yet');
  }
  throw new Error('deleteApiKey requires DATA_BACKEND=rama');
}

/**
 * Validate an inbound API key string.
 * Updates lastUsedAt on success and returns the key record.
 * Returns null if the key does not exist or is inactive.
 */
export async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  const { isRamaBackend } = await import('$lib/server/rama/config');
  if (isRamaBackend()) {
    // Env-backed emergency key for Rama cutover until ApiKeysModule exists.
    const { getOptionalEnv } = await import('$lib/server/utils/env');
    const envKey = getOptionalEnv('RAMA_API_KEY');
    if (!envKey || key !== envKey) return null;
    return {
      id: 0,
      name: 'rama-env',
      key,
      active: true,
      createdAt: new Date(0),
      lastUsedAt: new Date(),
      createdBy: 'system',
      creator: { steamUsername: 'system' },
    };
  }
  throw new Error('validateApiKey requires DATA_BACKEND=rama');
}
