/**
 * Root Layout Server Load
 * Provides session data, announcements, notifications, and environment info to all pages
 */

import type { LayoutServerLoad } from './$types';
import { hasAnySignupsOpen } from '$lib/server/services/settings';
import { getUserActiveTeam, isSignedUpForAllOpenFormats } from '$lib/server/services/users';
import { getNotificationsForDropdown } from '$lib/server/services/notifications';
import { getVisibleAnnouncements } from '$lib/server/services/announcements';
import { getSiteSettings } from '$lib/server/services/siteSettings';
import { getLeagueNav } from '$lib/server/services/seasons';
import { getOpenSignupFormats } from '$lib/server/services/signupSeasons';
import { isRealtimeNotificationsEnabled } from '$lib/server/utils/env';
import { EMPTY_LEAGUE_NAV } from '$lib/types/league';

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
      leagueNav: EMPTY_LEAGUE_NAV,
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

  // Check if any active signup season has signups open and load the leagues grid
  const [anySignupsOpen, siteSettings, leagueNav, openSignupFormats] = await Promise.all([
    hasAnySignupsOpen(),
    getSiteSettings(),
    getLeagueNav(),
    getOpenSignupFormats(),
  ]);
  // Inverted: signupClosed = NOT anySignupsOpen
  const signupClosed = !anySignupsOpen;

  // Hide Sign Up only when the user already has an entry in every open format
  let isInTeam = false;
  let userTeam: { id: number; name: string } | null = null;
  let notifications: Awaited<ReturnType<typeof getNotificationsForDropdown>> = [];
  let notificationCount = 0;

  if (locals.user) {
    const [activeTeam, signedUpForAllOpen] = await Promise.all([
      getUserActiveTeam(locals.user.steamId),
      isSignedUpForAllOpenFormats(
        locals.user.steamId,
        openSignupFormats.map((f) => f.id),
      ),
    ]);
    userTeam = activeTeam;
    isInTeam = signedUpForAllOpen;

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
    leagueNav,
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
