/**
 * Root Layout Server Load
 * Provides session data, announcements, and notifications to all pages
 */

import type { LayoutServerLoad } from './$types';
import { getGlobalSettings } from '$lib/server/services/settings';
import { getUserActiveTeam } from '$lib/server/services/users';
import { getUnreadNotifications } from '$lib/server/services/notifications';
import { getVisibleAnnouncements } from '$lib/server/services/announcements';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Get global settings for signup status
	const settings = await getGlobalSettings();
	const signupClosed = settings?.signupClosed === 1;

	// Check if user is in a team (to hide signup button if they are)
	let isInTeam = false;
	let userTeam: { id: number; name: string } | null = null;
	let notifications: any[] = [];
	let notificationCount = 0;

	if (locals.user) {
		userTeam = await getUserActiveTeam(locals.user.steamId);
		isInTeam = !!userTeam;

		notifications = await getUnreadNotifications(locals.user.steamId);
		notificationCount = notifications.length;
	}

	// Load visible announcements for site-wide display
	const announcements = await getVisibleAnnouncements();

	return {
		user: locals.user || null,
		announcements,
		notificationCount,
		notifications,
		signupClosed,
		isInTeam,
		userTeam
	};
};

