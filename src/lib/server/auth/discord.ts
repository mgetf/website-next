/**
 * Discord OAuth2 Authentication Utility
 * Handles Discord login flow for account linking
 */

import { env } from '$env/dynamic/private';

/**
 * Discord OAuth2 endpoints
 */
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_OAUTH_AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
const DISCORD_OAUTH_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_ENDPOINT = `${DISCORD_API_BASE}/users/@me`;

/**
 * Discord user data returned from API
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  global_name: string | null;
}

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
 * Generate Discord OAuth2 authorization URL
 * @param request - The incoming request (for dynamic domain detection)
 * @param steamId - User's Steam ID to include in state parameter
 * @returns Authorization URL to redirect user to
 */
export function getDiscordAuthUrl(request: Request, steamId: string): string {
  const domain = getDomain(request);
  const redirectUri = `${domain}/auth/discord/callback`;

  // Encode steamId in state parameter for CSRF protection
  const state = Buffer.from(
    JSON.stringify({ steamId, timestamp: Date.now() }),
  ).toString('base64');

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });

  return `${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token and fetch user data
 * @param code - Authorization code from Discord callback
 * @param state - State parameter to validate and extract steamId
 * @param request - The incoming request (for dynamic domain detection)
 * @returns Discord user data and steamId from state
 */
export async function handleDiscordCallback(
  code: string,
  state: string,
  request: Request,
): Promise<{ user: DiscordUser; steamId: string }> {
  // Decode and validate state parameter
  let stateData: { steamId: string; timestamp: number };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
  } catch (error) {
    throw new Error('Invalid state parameter');
  }

  // Check if state is not too old (5 minutes)
  const stateAge = Date.now() - stateData.timestamp;
  if (stateAge > 5 * 60 * 1000) {
    throw new Error('State parameter expired');
  }

  // Exchange code for access token
  const domain = getDomain(request);
  const redirectUri = `${domain}/auth/discord/callback`;

  const tokenParams = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID || '',
    client_secret: env.DISCORD_CLIENT_SECRET || '',
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(DISCORD_OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Discord token exchange failed:', errorText);
    throw new Error('Failed to exchange Discord authorization code');
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // Fetch user data
  const userResponse = await fetch(DISCORD_USER_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    console.error('Discord user fetch failed:', errorText);
    throw new Error('Failed to fetch Discord user data');
  }

  const user: DiscordUser = await userResponse.json();

  return {
    user,
    steamId: stateData.steamId,
  };
}

/**
 * Format Discord username for display
 * Uses global_name if available, otherwise username#discriminator (legacy) or just username
 */
export function formatDiscordUsername(user: DiscordUser): string {
  // Prefer global_name (new Discord display names)
  if (user.global_name) {
    return user.global_name;
  }

  // Legacy format with discriminator (if not #0)
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }

  // New format without discriminator
  return user.username;
}

/**
 * Get Discord avatar URL
 * Returns null if user has no custom avatar
 */
export function getDiscordAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}
