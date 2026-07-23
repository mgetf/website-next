/**
 * API Key Authentication Guard
 *
 * Validates Authorization: Bearer <key> headers for service-to-service API calls.
 * Use requireApiKey() at the top of any /api/v1/* endpoint handler.
 */

import { error } from '@sveltejs/kit';
import { validateApiKey, type ApiKeyRecord } from '$lib/server/services/apiKeys';
import { apiRateLimiter, checkRateLimit } from '$lib/server/utils/rateLimit';

/**
 * Extract and validate the Bearer token from the Authorization header.
 * Throws a 401 HTTP error if the key is missing, invalid, or inactive.
 */
export async function requireApiKey(request: Request): Promise<ApiKeyRecord> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw error(401, 'Missing or malformed Authorization header');
  }

  const key = authHeader.slice(7).trim();

  if (!key) {
    throw error(401, 'Missing API key');
  }

  const record = await validateApiKey(key);

  if (!record) {
    throw error(401, 'Invalid or inactive API key');
  }

  return record;
}

/**
 * Validate the API key and enforce the shared /api/v1 rate limit (per key).
 * Returns a 429 Response when the limit is exceeded; otherwise the key record.
 */
export async function requireRateLimitedApiKey(request: Request): Promise<ApiKeyRecord | Response> {
  const record = await requireApiKey(request);
  const { allowed, response } = checkRateLimit(apiRateLimiter, `apikey:${record.id}`);
  if (!allowed) return response!;
  return record;
}
