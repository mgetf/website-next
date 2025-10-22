/**
 * Admin Dashboard - Server Logic
 * Loads league analytics and statistics
 */

import type { PageServerLoad } from './$types';
import { requireAdmin } from '$lib/server/auth/permissions';
import { getAdminAnalytics } from '$lib/server/services/analytics';

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals.user);

	const analytics = await getAdminAnalytics();

	return {
		analytics
	};
};
