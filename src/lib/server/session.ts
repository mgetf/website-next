/**
 * Session Management
 * Handles user session data using signed cookies for security
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import crypto from 'crypto';
import { getSessionSecret } from '$lib/server/utils/env';
// Import shared types that work on both client and server
export type { SessionUser } from '$lib/types/user';
import type { SessionUser } from '$lib/types/user';

const SESSION_COOKIE_NAME = 'mge_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Sign session data with HMAC to prevent tampering
 */
function signSessionData(data: string): string {
  const secret = getSessionSecret();
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  const signature = hmac.digest('base64url');
  // Format: base64url(data).signature
  const encodedData = Buffer.from(data).toString('base64url');
  return `${encodedData}.${signature}`;
}

/**
 * Verify and extract session data from signed cookie
 * Returns null if signature is invalid or data is corrupted
 */
function verifySessionData(signedData: string): string | null {
  try {
    const secret = getSessionSecret();
    const [encodedData, signature] = signedData.split('.');

    if (!encodedData || !signature) {
      return null;
    }

    // Decode the data first
    const data = Buffer.from(encodedData, 'base64url').toString('utf8');

    // Recompute the signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const expectedSignature = hmac.digest('base64url');

    // Use timing-safe comparison to prevent timing attacks
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

/**
 * Get user session from cookies
 * Verifies the signature before parsing
 */
export function getSession(cookies: Cookies): SessionUser | null {
  const signedSessionData = cookies.get(SESSION_COOKIE_NAME);

  if (!signedSessionData) {
    return null;
  }

  // Verify signature and extract data
  const sessionData = verifySessionData(signedSessionData);

  if (!sessionData) {
    // Invalid signature - could be tampering attempt or old unsigned session
    // Clear the invalid cookie
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  try {
    return JSON.parse(sessionData) as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Set user session in cookies
 * Signs the session data before storing
 */
export function setSession(cookies: Cookies, user: SessionUser): void {
  const sessionData = JSON.stringify(user);
  const signedData = signSessionData(sessionData);

  cookies.set(SESSION_COOKIE_NAME, signedData, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Clear user session
 */
export function clearSession(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE_NAME, {
    path: '/',
  });
}

/**
 * Restrict post-login redirects to same-origin relative paths.
 * Rejects absolute URLs, protocol-relative URLs, backslash tricks, and
 * embedded control characters that could be used for an open redirect.
 * Falls back to '/' for anything that doesn't look like a safe relative path.
 */
export function sanitizeRedirectUrl(raw: string | null | undefined): string {
  if (!raw) return '/';

  // Reject control characters (including newlines, which can smuggle headers)
  if (/[\x00-\x1f]/.test(raw)) return '/';

  // Must start with a single '/' and not be protocol-relative ('//...')
  // or use a backslash to trick browsers into treating it as protocol-relative.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/';
  }

  // Belt-and-suspenders: reject if it parses as an absolute URL with a different origin.
  try {
    const parsed = new URL(raw, 'https://mge.tf');
    if (parsed.origin !== 'https://mge.tf') return '/';
  } catch {
    return '/';
  }

  return raw;
}

/**
 * Store redirect URL for post-login navigation
 */
export function setRedirectUrl(cookies: Cookies, url: string): void {
  cookies.set('mge_redirect', sanitizeRedirectUrl(url), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: !dev,
    maxAge: 600, // 10 minutes
  });
}

/**
 * Get and clear redirect URL
 */
export function getAndClearRedirectUrl(cookies: Cookies): string {
  const url = cookies.get('mge_redirect');
  cookies.delete('mge_redirect', { path: '/' });
  return sanitizeRedirectUrl(url);
}
