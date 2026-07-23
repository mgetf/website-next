import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireRateLimitedApiKey } from '$lib/server/auth/apiKey';
import { uploadMatchLog, getLogPublicUrl, ParseError } from '$lib/server/services/matchLogs';

const MAX_BODY_BYTES = 600 * 1024;

export const POST: RequestHandler = async ({ request }) => {
  const auth = await requireRateLimitedApiKey(request);
  if (auth instanceof Response) return auth;

  let body: { matchid?: unknown; log?: unknown; hostname?: unknown };

  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { matchid, log, hostname } = body;

  if (typeof matchid !== 'string' || !matchid.trim()) {
    return json({ success: false, error: 'Missing or invalid field: matchid' }, { status: 400 });
  }

  if (typeof log !== 'string' || !log.trim()) {
    return json({ success: false, error: 'Missing or invalid field: log' }, { status: 400 });
  }

  if (Buffer.byteLength(log, 'utf-8') > MAX_BODY_BYTES) {
    return json({ success: false, error: 'Log exceeds maximum allowed size' }, { status: 413 });
  }

  const hostnameValue = typeof hostname === 'string' ? hostname.trim() || undefined : undefined;

  try {
    const summary = await uploadMatchLog({
      mgeMatchId: matchid.trim(),
      logText: log,
      hostname: hostnameValue,
    });

    const url = `https://mge.tf${getLogPublicUrl(summary.id)}`;
    return json({ success: true, url });
  } catch (err) {
    if (err instanceof ParseError) {
      return json({ success: false, error: err.message }, { status: 422 });
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = (err as { status?: number }).status ?? 500;
    return json({ success: false, error: message }, { status });
  }
};
