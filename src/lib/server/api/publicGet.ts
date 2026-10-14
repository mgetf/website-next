/**
 * Shared gate for anonymous /api/v1 league reads.
 * No API key. One quota per client address, then { error } for bad params and missing resources.
 */

import { PublicNotFoundError, PublicQueryError } from '#lib/server/api/publicLeagueQuery.js';
import {
  enforceRateLimit,
  PUBLIC_READ_POLICY,
  publicReadRateLimiter,
} from '#lib/server/utils/rateLimit.js';

function clientAddress(getClientAddress: () => string): string {
  try {
    const address = getClientAddress().trim();
    return address || 'unknown';
  } catch {
    return 'unknown';
  }
}

function withRateLimit(response: Response, rateHeaders: Headers): Response {
  const headers = new Headers(response.headers);
  rateHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function publicGet(
  getClientAddress: () => string,
  load: () => Promise<unknown>,
): Promise<Response> {
  const limit = enforceRateLimit(
    publicReadRateLimiter,
    clientAddress(getClientAddress),
    PUBLIC_READ_POLICY,
  );
  if (limit.response) return limit.response;

  try {
    return withRateLimit(Response.json(await load()), limit.headers);
  } catch (err) {
    if (err instanceof PublicQueryError) {
      return withRateLimit(Response.json({ error: err.message }, { status: 400 }), limit.headers);
    }
    if (err instanceof PublicNotFoundError) {
      return withRateLimit(Response.json({ error: err.message }, { status: 404 }), limit.headers);
    }
    throw err;
  }
}
