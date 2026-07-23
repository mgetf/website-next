/**
 * Discord OAuth2 Authentication Utility
 * Handles Discord login flow for account linking
 */

import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import crypto from 'crypto';
import { getSessionSecret } from '$lib/server/utils/env';

/**
 * Discord OAuth2 endpoints
 */
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_OAUTH_AUTHORIZE = 'https://discord.com/api/oauth2/authorize';
const DISCORD_OAUTH_TOKEN = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_ENDPOINT = `${DISCORD_API_BASE}/users/@me`;

const DISCORD_OAUTH_NONCE_COOKIE = 'mge_discord_oauth_nonce';
const STATE_MAX_AGE_MS = 5 * 60 * 1000;

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

type DiscordOAuthState = {
  steamId: string;
  timestamp: number;
  nonce: string;
};

function getRedirectUri(request: Request): string {
  if (env.DISCORD_REDIRECT_URI) {
    return env.DISCORD_REDIRECT_URI.trim().replace(/^["']|["']$/g, '');
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/auth/discord/callback`;
}

function signStatePayload(data: string): string {
  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('base64url');
  const encodedData = Buffer.from(data).toString('base64url');
  return `${encodedData}.${signature}`;
}

function verifyStatePayload(signedData: string): string | null {
  try {
    const secret = getSessionSecret();
    const [encodedData, signature] = signedData.split('.');

    if (!encodedData || !signature) {
      return null;
    }

    const data = Buffer.from(encodedData, 'base64url').toString('utf8');

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('base64url');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

function noncesMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Generate Discord OAuth2 authorization URL and bind a nonce cookie to this browser.
 * @param request - The incoming request (fallback for local dev domain detection)
 * @param steamId - User's Steam ID to include in state parameter
 * @param cookies - Cookie jar used to store the one-time OAuth nonce
 * @returns Authorization URL to redirect user to
 */
export function getDiscordAuthUrl(request: Request, steamId: string, cookies: Cookies): string {
  const redirectUri = getRedirectUri(request);
  const nonce = crypto.randomBytes(32).toString('base64url');

  const statePayload: DiscordOAuthState = {
    steamId,
    timestamp: Date.now(),
    nonce,
  };
  const state = signStatePayload(JSON.stringify(statePayload));

  cookies.set(DISCORD_OAUTH_NONCE_COOKIE, nonce, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 600,
  });

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
 * Verify the OAuth state signature, nonce cookie, and that the state steamId
 * matches the currently authenticated session user.
 */
export function verifyDiscordOAuthState(
  state: string,
  cookies: Cookies,
  expectedSteamId: string,
): { steamId: string } {
  const payload = verifyStatePayload(state);
  if (!payload) {
    throw new Error('Invalid state parameter');
  }

  let stateData: DiscordOAuthState;
  try {
    stateData = JSON.parse(payload) as DiscordOAuthState;
  } catch {
    throw new Error('Invalid state parameter');
  }

  if (
    typeof stateData.steamId !== 'string' ||
    typeof stateData.timestamp !== 'number' ||
    typeof stateData.nonce !== 'string'
  ) {
    throw new Error('Invalid state parameter');
  }

  const stateAge = Date.now() - stateData.timestamp;
  if (stateAge > STATE_MAX_AGE_MS || stateAge < 0) {
    throw new Error('State parameter expired');
  }

  const cookieNonce = cookies.get(DISCORD_OAUTH_NONCE_COOKIE);
  cookies.delete(DISCORD_OAUTH_NONCE_COOKIE, { path: '/' });

  if (!cookieNonce || !noncesMatch(cookieNonce, stateData.nonce)) {
    throw new Error('Invalid OAuth nonce');
  }

  if (stateData.steamId !== expectedSteamId) {
    throw new Error('Steam ID mismatch');
  }

  return { steamId: stateData.steamId };
}

/**
 * Exchange authorization code for access token and fetch Discord user data
 */
export async function exchangeDiscordCode(code: string, request: Request): Promise<DiscordUser> {
  const redirectUri = getRedirectUri(request);

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
      'User-Agent': 'mge.tf (https://mge.tf)',
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

  const userResponse = await fetch(DISCORD_USER_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'mge.tf (https://mge.tf)',
    },
  });

  if (!userResponse.ok) {
    const errorText = await userResponse.text();
    console.error('Discord user fetch failed:', errorText);
    throw new Error('Failed to fetch Discord user data');
  }

  return (await userResponse.json()) as DiscordUser;
}

/**
 * Format the Discord account handle for display (profile, admin lists, API).
 * Uses the unique username (new system) or username#discriminator (legacy), not global_name.
 */
export function formatDiscordUsername(user: DiscordUser): string {
  if (user.discriminator && user.discriminator !== '0') {
    return `${user.username}#${user.discriminator}`;
  }
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
