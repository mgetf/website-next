/**
 * SvelteKit Server Hooks
 * Handles session management, security headers, dev environment gating,
 * and makes user data available to all routes
 */

import type { Handle, HandleServerError } from '@sveltejs/kit';
import { getSession, setSession, clearSession } from '$lib/server/session';
import { dev } from '$app/environment';
import { isStaging, isUngatedRoute, getAppEnvironment } from '$lib/server/utils/environment';
import { isAdmin } from '$lib/server/auth/permissions';
import { validateEnvironment } from '$lib/server/utils/env';
import { getSessionVersion, getSessionFields } from '$lib/server/services/users';
import { BanStatus, UserRole } from '$lib/types/user';

validateEnvironment();

export const handle: Handle = async ({ event, resolve }) => {
  let user = getSession(event.cookies);

  if (user) {
    const dbVersion = await getSessionVersion(user.steamId);
    if ((user.sessionVersion ?? 0) !== dbVersion) {
      const fresh = await getSessionFields(user.steamId);
      if (!fresh || fresh.banStatus === 'BANNED' || fresh.banStatus === 'SUSPENDED') {
        clearSession(event.cookies);
        user = null;
      } else {
        user = {
          ...user,
          steamUsername: fresh.steamUsername,
          steamAvatar: fresh.steamAvatar ?? user.steamAvatar,
          permissionLevel: fresh.permissionLevel as unknown as UserRole,
          banStatus: fresh.banStatus as unknown as BanStatus,
          sessionVersion: fresh.sessionVersion,
        };
        setSession(event.cookies, user);
      }
    }
  }

  event.locals.user = user;

  // Store environment info for layouts/pages
  event.locals.appEnvironment = getAppEnvironment();

  // ===== DEV/STAGING ENVIRONMENT GATE =====
  // In staging environment, only admins can access the site
  // Non-admins see only a login page
  if (isStaging() && !isUngatedRoute(event.url.pathname)) {
    if (!isAdmin(user)) {
      // Return early with a minimal response that will be handled by the layout
      // The layout will show the DevGate component
      event.locals.devGated = true;
    }
  }

  // Continue with request
  const response = await resolve(event);

  // Add security headers to all responses
  // These headers protect against common web vulnerabilities

  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Enable browser XSS filter (legacy, but still useful for older browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Control referrer information sent with requests
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features (camera, microphone, geolocation, etc.)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self)',
  );

  // Content Security Policy - controls which resources can be loaded
  // Adjust these values based on your actual content sources
  const cspDirectives = [
    "default-src 'self'",
    // Scripts: self, inline (for Svelte), PayPal, jsDelivr CDN, and Cloudflare Insights
    "script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com",
    // Styles: self, inline (for Svelte/Tailwind), Google Fonts, and jsDelivr CDN
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    // Images: self, data URIs, and HTTPS sources (Steam avatars, etc.)
    "img-src 'self' data: https:",
    // Fonts: self and Google Fonts
    "font-src 'self' https://fonts.gstatic.com",
    // Frames: PayPal and Steam
    'frame-src https://www.paypal.com https://www.sandbox.paypal.com https://steamcommunity.com',
    // Connect: self, PayPal API, and Cloudflare
    "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://cloudflareinsights.com",
    // Form actions: self and Steam OpenID (for login redirect)
    "form-action 'self' https://steamcommunity.com",
    // Base URI: self
    "base-uri 'self'",
    // Prevent object/embed
    "object-src 'none'",
  ];

  response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

  // HSTS - force HTTPS in production (browsers will refuse HTTP after seeing this)
  if (!dev) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
};

export const handleError: HandleServerError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();

  if (dev) {
    console.error(`[${errorId}] ${status}:`, error);
  } else {
    console.error(`[${errorId}] Unexpected server error (${status}):`, error);
  }

  return {
    message,
    code: errorId,
  };
};
