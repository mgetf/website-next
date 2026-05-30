/**
 * Root Layout Server Load
 * Provides session data, announcements, notifications, and environment info to all pages
 */

import type { LayoutServerLoad } from './$types';
import { hasAnySignupsOpen } from '$lib/server/services/settings';
import { getUserActiveTeam } from '$lib/server/services/users';
import { getNotificationsForDropdown } from '$lib/server/services/notifications';
import { getVisibleAnnouncements } from '$lib/server/services/announcements';
import { getSiteSettings } from '$lib/server/services/siteSettings';
import { isRealtimeNotificationsEnabled } from '$lib/server/utils/env';

export const load: LayoutServerLoad = async ({ locals }) => {
  // If site is dev-gated (staging mode, non-admin user), return minimal data
  if (locals.devGated) {
    return {
      user: locals.user || null,
      devGated: true,
      appEnvironment: locals.appEnvironment,
      realtimeEnabled: isRealtimeNotificationsEnabled(),
      // Provide empty defaults for other fields
      announcements: [],
      notificationCount: 0,
      notifications: [],
      signupClosed: true,
      isInTeam: false,
      userTeam: null,
      siteSettings: {
        siteTitle: 'MGE.tf Dev',
        faviconPath: null,
        backgroundImagePath: null,
        backgroundBlur: 0,
        backgroundBrightness: 1,
        backgroundOverlay: 0.85,
      },
    };
  }

  // Check if any active signup season has signups open
  const [anySignupsOpen, siteSettings] = await Promise.all([
    hasAnySignupsOpen(),
    getSiteSettings(),
  ]);
  // Inverted: signupClosed = NOT anySignupsOpen
  const signupClosed = !anySignupsOpen;

  // Check if user is in a team (to hide signup button if they are)
  let isInTeam = false;
  let userTeam: { id: number; name: string } | null = null;
  let notifications: Awaited<ReturnType<typeof getNotificationsForDropdown>> = [];
  let notificationCount = 0;

  if (locals.user) {
    userTeam = await getUserActiveTeam(locals.user.steamId);
    isInTeam = !!userTeam;

    notifications = await getNotificationsForDropdown(locals.user.steamId);
    notificationCount = notifications.filter((n) => !n.isRead).length;
  }

  // Load visible announcements for site-wide display
  const announcements = await getVisibleAnnouncements();

  return {
    user: locals.user || null,
    devGated: false,
    appEnvironment: locals.appEnvironment,
    realtimeEnabled: isRealtimeNotificationsEnabled(),
    announcements,
    notificationCount,
    notifications,
    signupClosed,
    isInTeam,
    userTeam,
    siteSettings: {
      siteTitle: siteSettings.siteTitle,
      faviconPath: siteSettings.faviconPath,
      backgroundImagePath: siteSettings.backgroundImagePath,
      backgroundBlur: siteSettings.backgroundBlur,
      backgroundBrightness: siteSettings.backgroundBrightness,
      backgroundOverlay: siteSettings.backgroundOverlay,
    },
  };
};
