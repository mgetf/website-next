import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireApiKey } from '$lib/server/auth/apiKey';
import { settleExpiredReschedules } from '$lib/server/services/matchComms';

export const POST: RequestHandler = async ({ request }) => {
  await requireApiKey(request);

  const settledCount = await settleExpiredReschedules();

  return json({
    success: true,
    settledCount,
  });
};
