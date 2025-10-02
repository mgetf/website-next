/**
 * SvelteKit Server Hooks
 * Handles session management and makes user data available to all routes
 */

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

