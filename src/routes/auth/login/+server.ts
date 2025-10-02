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
	const redirectUrl = await steam.getRedirectUrl();
	
	throw redirect(302, redirectUrl);
};

