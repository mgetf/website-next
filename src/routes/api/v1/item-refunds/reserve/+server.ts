import { isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireRateLimitedApiKey } from '#lib/server/auth/apiKey.js';
import { reserveItemRefundAssets } from '#lib/server/services/refunds.js';
import { getErrorMessage } from '#lib/server/utils/errors.js';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  let body: { refundId?: number; assetIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.refundId || !Array.isArray(body.assetIds)) {
    return Response.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  try {
    const assetIds = await reserveItemRefundAssets(body.refundId, body.assetIds);
    return Response.json({ success: true, assetIds });
  } catch (err) {
    const status = isHttpError(err) ? err.status : 500;
    return Response.json(
      { success: false, error: getErrorMessage(err, 'Could not reserve the items') },
      { status },
    );
  }
};
