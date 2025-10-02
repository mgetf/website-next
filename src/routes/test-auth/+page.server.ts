/**
 * Auth Test Page - Server Load
 * Demonstrates session persistence
 */

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		user: locals.user
	};
};

