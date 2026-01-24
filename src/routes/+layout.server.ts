/**
 * Root Layout Server Load
 * Provides session data, announcements, and notifications to all pages
 */

import type { LayoutServerLoad } from './$types';
import { hasAnySignupsOpen } from '$lib/server/services/settings';
import { getUserActiveTeam } from '$lib/server/services/users';
import { getUnreadNotifications } from '$lib/server/services/notifications';
import { getVisibleAnnouncements } from '$lib/server/services/announcements';
import { getSiteSettings } from '$lib/server/services/siteSettings';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Check if any active signup season has signups open
	const [anySignupsOpen, siteSettings] = await Promise.all([
		hasAnySignupsOpen(),
		getSiteSettings()
	]);
	// Inverted: signupClosed = NOT anySignupsOpen
	const signupClosed = !anySignupsOpen;

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
		userTeam,
		siteSettings: {
			siteTitle: siteSettings.siteTitle,
			faviconPath: siteSettings.faviconPath
		}
	};
};

