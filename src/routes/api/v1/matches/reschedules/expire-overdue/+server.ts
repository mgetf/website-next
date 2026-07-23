import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { settleExpiredReschedules } from '$lib/server/services/matchComms';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  const settledCount = await settleExpiredReschedules();

  return json({
    success: true,
    settledCount,
  });
};
