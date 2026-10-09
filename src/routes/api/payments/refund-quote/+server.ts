import { error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/auth/permissions.js';
import { quoteRefund } from '#lib/server/services/refunds.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

export const GET: RequestHandler = async ({ url, locals }) => {
  requireAdmin(locals.user);

  const steamId = url.searchParams.get('steamId') ?? '';
  const sourceId = url.searchParams.get('sourceId') ?? '';
  const method = url.searchParams.get('method');
  if (!steamId || !sourceId || (method !== 'paypal' && method !== 'items')) {
    throw error(400, 'Missing refund details');
  }

  try {
    const quote = await quoteRefund(steamId, method, sourceId);
    return Response.json(quote);
  } catch (err) {
    if (isHttpError(err)) throw err;
    throw error(500, getErrorMessage(err, 'Could not load the refund'));
  }
};
