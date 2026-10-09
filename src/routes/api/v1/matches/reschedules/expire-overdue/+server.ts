import type { RequestHandler } from './$types';

import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { settleExpiredReschedules } from '#lib/server/services/matchComms.js';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const settledCount = await settleExpiredReschedules();

  return Response.json({
    success: true,
    settledCount,
  });
};
