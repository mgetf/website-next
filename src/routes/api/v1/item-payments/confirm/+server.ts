import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { confirmItemPayment } from '$lib/server/services/item-payments';
import { logAudit, AuditCategory, AuditAction } from '$lib/server/services/auditLog';

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  let body: {
    orderNumber: string;
    tradeOfferId: string;
    itemsReceived: number;
    senderSteamId: string;
  };

  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { orderNumber, tradeOfferId, itemsReceived, senderSteamId } = body;

  if (!orderNumber || !tradeOfferId || itemsReceived == null || !senderSteamId) {
    return json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  try {
    await confirmItemPayment({ orderNumber, tradeOfferId, itemsReceived, senderSteamId });

    await logAudit({
      actorId: null,
      actorRole: null,
      category: AuditCategory.PAYMENT,
      action: AuditAction.ITEM_PAYMENT_CONFIRMED,
      targetType: 'ItemPaymentOrder',
      targetId: orderNumber,
      metadata: { orderNumber, tradeOfferId, itemsReceived, senderSteamId },
    });

    return json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = (err as { status?: number }).status ?? 500;
    return json({ success: false, error: message }, { status });
  }
};
