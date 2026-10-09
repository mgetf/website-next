import type { RequestHandler } from './$types';
import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { listPendingItemRefunds } from '#lib/server/services/refunds.js';

export const GET: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const refunds = await listPendingItemRefunds();
  return Response.json({ refunds });
};
