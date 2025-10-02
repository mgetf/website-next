/**
 * Logout Handler
 * POST /auth/logout - Clears user session
 */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSession } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	throw redirect(302, '/');
};

// Also support GET for simple links
export const GET: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	throw redirect(302, '/');
};

