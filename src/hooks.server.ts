/**
 * SvelteKit Server Hooks
 * Handles session management and makes user data available to all routes
 */

// Set body size limit for file uploads (200MB) - must be before any imports that use it
// This allows demo uploads without needing external environment variable configuration
if (!process.env.BODY_SIZE_LIMIT) {
	process.env.BODY_SIZE_LIMIT = String(200 * 1024 * 1024); // 200MB
}

import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';

export const handle: Handle = async ({ event, resolve }) => {
	// Get user session from cookies
	const user = getSession(event.cookies);

	// Make user available in locals for all server-side code
	event.locals.user = user;

	// Continue with request
	return resolve(event);
};

