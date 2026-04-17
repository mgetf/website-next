/**
 * Steam Login Initiation
 * GET /auth/login - Redirects to Steam OpenID
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSteamAuth } from '$lib/server/auth/steam';
import { setRedirectUrl } from '$lib/server/session';

export const GET: RequestHandler = async ({ cookies, url, request }) => {
  // Save the page they came from for redirect after login
  const referer = url.searchParams.get('redirect') || '/';
  setRedirectUrl(cookies, referer);

  // Create Steam auth instance and get redirect URL
  const steam = createSteamAuth(request);

  let redirectUrl: string;
  try {
    redirectUrl = await steam.getRedirectUrl();
  } catch (err) {
    // node-steam-openid stringifies the underlying openid error via `"..." + error`,
    // which yields "[object Object]". Log the raw value here so we can see what Steam
    // actually returned (timeout, 5xx, TLS error, etc.) when discovery fails.
    console.error('Steam OpenID discovery failed:', err);
    throw redirect(302, '/?error=steam_unavailable');
  }

  throw redirect(302, redirectUrl);
};
