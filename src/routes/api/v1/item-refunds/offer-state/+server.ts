import { isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { updateItemRefundFromOffer } from '#lib/server/services/refunds.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  let body: { tradeOfferId?: string; outcome?: string; error?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.tradeOfferId || (body.outcome !== 'accepted' && body.outcome !== 'failed')) {
    return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  try {
    await updateItemRefundFromOffer(body.tradeOfferId, body.outcome, body.error);
    return Response.json({ success: true });
  } catch (err) {
    const status = isHttpError(err) ? err.status : 500;
    return Response.json(
      { success: false, error: getErrorMessage(err, 'Could not update the refund') },
      { status },
    );
  }
};
