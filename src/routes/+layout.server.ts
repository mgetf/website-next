/**
 * Root Layout Server Load
 * Provides session data and announcements to all pages
 */

import type { LayoutServerLoad } from './$types';
import { prisma } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Simplified for now - will add database queries back later
	return {
		user: locals.user || null,
		announcements: [],
		notificationCount: 0,
		notifications: []
	};
};

