/**
 * Steam OpenID Authentication Utility
 * Handles Steam login flow using node-steam-openid
 */

import SteamAuth from 'node-steam-openid';
import { env } from '$env/dynamic/private';
import { getOptionalEnv } from '$lib/server/utils/env';

/**
 * Get canonical site origin for Steam OpenID realm/returnUrl.
 * Prefer PUBLIC_URL so Host-header spoofing cannot redirect the OpenID flow.
 * Falls back to the request Host only when PUBLIC_URL is unset (local dev).
 */
export function getDomain(request: Request): string {
  const configured = getOptionalEnv('PUBLIC_URL').replace(/\/$/, '');
  if (configured) {
    return configured;
  }

  const host = request.headers.get('host') || 'localhost:5173';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

/**
 * Create a SteamAuth instance for the current request
 * Must be created per-request to handle dynamic domains
 */
export function createSteamAuth(request: Request): SteamAuth {
  const domain = getDomain(request);
  return new SteamAuth({
    realm: domain,
    returnUrl: `${domain}/auth/verify`,
    apiKey: env.STEAM_API_KEY ?? '',
  });
}
