/**
 * Shared reading and logging for Discord HTTP 429 responses.
 * Bot calls and the OAuth token exchange hit different routes, but a burst of
 * 429s from either one can get this server's IP blocked for every Discord call.
 */

export type DiscordRateLimitDetails = {
  retryAfterSeconds: number | null;
  global: boolean;
  scope: string | null;
  bucket: string | null;
  limit: string | null;
  remaining: string | null;
  message: string | null;
};

export class DiscordRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number | null) {
    super('Discord rate limit exceeded');
    this.name = 'DiscordRateLimitError';
  }
}

function header(response: Response, name: string): string | null {
  const value = response.headers.get(name);
  return value && value.length > 0 ? value : null;
}

function retryAfterFromPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || !('retry_after' in payload)) return null;
  const seconds = Number((payload as { retry_after: unknown }).retry_after);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

function retryAfterFromHeader(response: Response): number | null {
  const raw = header(response, 'Retry-After');
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

export function readDiscordRateLimit(
  response: Response,
  payload: unknown,
): DiscordRateLimitDetails {
  const global =
    Boolean(payload && typeof payload === 'object' && 'global' in payload && payload.global) ||
    header(response, 'X-RateLimit-Scope') === 'global';

  const message =
    payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : null;

  return {
    retryAfterSeconds: retryAfterFromPayload(payload) ?? retryAfterFromHeader(response),
    global,
    scope: header(response, 'X-RateLimit-Scope'),
    bucket: header(response, 'X-RateLimit-Bucket'),
    limit: header(response, 'X-RateLimit-Limit'),
    remaining: header(response, 'X-RateLimit-Remaining'),
    message,
  };
}

/** Short label so production logs show which feature issued the call. */
export function describeDiscordRequest(method: string, path: string): string {
  const route = path.split('?')[0] ?? path;
  const verb = method.toUpperCase();

  if (route.endsWith('/oauth2/token')) return 'account linking: exchange authorization code';
  if (route.endsWith('/users/@me')) return 'account linking: read Discord profile';
  if (route.endsWith('/users/@me/channels')) return 'verification: open direct message';
  if (/\/guilds\/[^/]+\/members$/.test(route)) return 'admin staff page: list every server member';
  if (/\/guilds\/[^/]+\/members\/[^/]+$/.test(route)) {
    return verb === 'PATCH' ? 'role sync: update member roles' : 'role sync: read member roles';
  }
  if (/\/guilds\/[^/]+\/roles$/.test(route)) return 'staff settings: list server roles';
  if (/\/channels\/[^/]+\/messages$/.test(route)) return 'verification: send channel message';
  if (/\/users\/\d+$/.test(route)) return 'admin: look up Discord user';
  return `${verb} ${route}`;
}

export function logDiscordRateLimit(params: {
  source: 'oauth' | 'bot';
  method: string;
  path: string;
  attempt?: number;
  info: DiscordRateLimitDetails;
}): void {
  const route = params.path.split('?')[0] ?? params.path;
  console.warn('[discord-rate-limit]', {
    source: params.source,
    call: describeDiscordRequest(params.method, params.path),
    method: params.method.toUpperCase(),
    path: route,
    attempt: params.attempt ?? 1,
    retryAfterSeconds: params.info.retryAfterSeconds,
    global: params.info.global,
    scope: params.info.scope,
    bucket: params.info.bucket,
    limit: params.info.limit,
    remaining: params.info.remaining,
    message: params.info.message,
  });
}
