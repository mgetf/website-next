/**
 * Steam OpenID Authentication Utility
 * Handles Steam login flow using node-steam-openid
 */

import SteamAuth from 'node-steam-openid';
import { env } from '$env/dynamic/private';

/**
 * Get domain from request headers
 * Auto-detects http/https based on host
 */
export function getDomain(request: Request): string {
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

/**
 * Steam user data returned from authentication
 */
export interface SteamUser {
  steamid: string;
  username: string;
  avatar: {
    small: string;
    medium: string;
    large: string;
  };
  profile: string;
}
