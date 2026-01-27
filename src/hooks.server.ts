/**
 * SvelteKit Server Hooks
 * Handles session management, security headers, and makes user data available to all routes
 */

import type { Handle } from '@sveltejs/kit';
import { getSession } from '$lib/server/session';
import { dev } from '$app/environment';

export const handle: Handle = async ({ event, resolve }) => {
	// Get user session from cookies
	const user = getSession(event.cookies);

	// Make user available in locals for all server-side code
	event.locals.user = user;

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
		'camera=(), microphone=(), geolocation=(), payment=(self)'
	);

	// Content Security Policy - controls which resources can be loaded
	// Adjust these values based on your actual content sources
	const cspDirectives = [
		"default-src 'self'",
		// Scripts: self, inline (for Svelte), PayPal, and jsDelivr CDN (brackets-viewer)
		"script-src 'self' 'unsafe-inline' https://www.paypal.com https://www.sandbox.paypal.com https://cdn.jsdelivr.net",
		// Styles: self, inline (for Svelte/Tailwind), Google Fonts, and jsDelivr CDN
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
		// Images: self, data URIs, and HTTPS sources (Steam avatars, etc.)
		"img-src 'self' data: https:",
		// Fonts: self and Google Fonts
		"font-src 'self' https://fonts.gstatic.com",
		// Frames: PayPal and Steam
		"frame-src https://www.paypal.com https://www.sandbox.paypal.com https://steamcommunity.com",
		// Connect: self and PayPal API
		"connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com",
		// Form actions: self
		"form-action 'self'",
		// Base URI: self
		"base-uri 'self'",
		// Prevent object/embed
		"object-src 'none'"
	];

	response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

	// HSTS - force HTTPS in production (browsers will refuse HTTP after seeing this)
	if (!dev) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}

	return response;
};

