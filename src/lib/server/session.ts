/**
 * Session Management
 * Handles user session data using cookies
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
// Import shared types that work on both client and server
export type { SessionUser } from '$lib/types/user';
import type { SessionUser } from '$lib/types/user';

const SESSION_COOKIE_NAME = 'mge_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Get user session from cookies
 */
export function getSession(cookies: Cookies): SessionUser | null {
	const sessionData = cookies.get(SESSION_COOKIE_NAME);
	
	if (!sessionData) {
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
 */
export function setSession(cookies: Cookies, user: SessionUser): void {
	cookies.set(SESSION_COOKIE_NAME, JSON.stringify(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: SESSION_MAX_AGE
	});
}

/**
 * Clear user session
 */
export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE_NAME, {
		path: '/'
	});
}

/**
 * Store redirect URL for post-login navigation
 */
export function setRedirectUrl(cookies: Cookies, url: string): void {
	cookies.set('mge_redirect', url, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: 600 // 10 minutes
	});
}

/**
 * Get and clear redirect URL
 */
export function getAndClearRedirectUrl(cookies: Cookies): string {
	const url = cookies.get('mge_redirect') || '/';
	cookies.delete('mge_redirect', { path: '/' });
	return url;
}

