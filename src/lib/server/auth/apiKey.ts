/**
 * API Key Authentication Guard
 *
 * Validates Authorization: Bearer <key> headers for service-to-service API calls.
 * Use requireApiKey() at the top of any /api/v1/* endpoint handler.
 */

import { error } from '@sveltejs/kit';
import { validateApiKey, type ApiKeyRecord } from '#lib/server/services/apiKeys.js';
import { apiRateLimiter, checkRateLimit } from '#lib/server/utils/rateLimit.js';

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
 *
 * Pass `{ write: true }` on mutating (POST) handlers: READ-scoped keys get
 * 403 there, while WRITE keys (the pre-scope default) keep full access.
 * GET handlers call this without the flag and accept either scope.
 */
export async function requireRateLimitedApiKey(
  request: Request,
  opts: { write?: boolean } = {},
): Promise<ApiKeyRecord | Response> {
  const record = await requireApiKey(request);
  if (opts.write && record.scope === 'READ') {
    throw error(403, 'Read-only API key cannot call write endpoints');
  }
  const { allowed, response } = checkRateLimit(apiRateLimiter, `apikey:${record.id}`);
  if (!allowed) return response!;
  return record;
}
