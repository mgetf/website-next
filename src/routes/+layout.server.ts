/**
 * Root Layout Server Load
 * Provides session data and announcements to all pages
 */

import type { LayoutServerLoad } from './$types';
import { getGlobalSettings } from '$lib/server/services/settings';
import { getUserActiveTeam } from '$lib/server/services/users';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Get global settings for signup status
	const settings = await getGlobalSettings();
	const signupClosed = settings?.signupClosed === 1;

	// Check if user is in a team (to hide signup button if they are)
	let isInTeam = false;
	let userTeam: { id: number; name: string } | null = null;
	if (locals.user) {
		userTeam = await getUserActiveTeam(locals.user.steamId);
		isInTeam = !!userTeam;
	}

	return {
		user: locals.user || null,
		announcements: [],
		notificationCount: 0,
		notifications: [],
		signupClosed,
		isInTeam,
		userTeam
	};
};

