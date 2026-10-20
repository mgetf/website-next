/**
 * Root Layout Server Load
 * Provides session data, announcements, notifications, and environment info to all pages
 */

import type { LayoutServerLoad } from './$types';
import { hasAnySignupsOpen } from '#lib/server/services/settings.js';
import {
  getUserActiveTeams,
  isSignedUpForAllOpenFormats,
  getActivePunishmentNotice,
} from '#lib/server/services/users.js';
import { getNotificationsForDropdown } from '#lib/server/services/notifications.js';
import { getVisibleAnnouncements } from '#lib/server/services/announcements.js';
import { getSiteSettings } from '#lib/server/services/siteSettings.js';
import { getLeagueNav } from '#lib/server/services/seasons.js';
import { getOpenSignupFormats } from '#lib/server/services/signupSeasons.js';
import { isRealtimeNotificationsEnabled } from '#lib/server/utils/env.js';
import { getPunishmentNoticeCookie } from '#lib/server/utils/punishmentNotice.js';
import { EMPTY_LEAGUE_NAV } from '#lib/types/league.js';
import { BanStatus } from '#lib/types/user.js';
import type { PunishmentNotice } from '#lib/types/punishment.js';
import { getCartCount } from '#lib/server/services/cart.js';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  let punishmentNotice: PunishmentNotice | null = getPunishmentNoticeCookie(cookies);
  if (!punishmentNotice && locals.user?.banStatus === BanStatus.WARNING) {
    punishmentNotice = await getActivePunishmentNotice(locals.user.steamId);
  }

  // If site is dev-gated (staging mode, non-admin user), return minimal data
  if (locals.devGated) {
    return {
      user: locals.user || null,
      punishmentNotice,
      devGated: true,
      appEnvironment: locals.appEnvironment,
      realtimeEnabled: isRealtimeNotificationsEnabled(),
      // Provide empty defaults for other fields
      announcements: [],
      notificationCount: 0,
      notifications: [],
      signupClosed: true,
      isInTeam: false,
      userTeams: [],
      cartCount: 0,
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
  let userTeams: Awaited<ReturnType<typeof getUserActiveTeams>> = [];
  let notifications: Awaited<ReturnType<typeof getNotificationsForDropdown>> = [];
  let notificationCount = 0;
  let cartCount = 0;

  if (locals.user) {
    const [activeTeams, signedUpForAllOpen, cartItems] = await Promise.all([
      getUserActiveTeams(locals.user.steamId),
      isSignedUpForAllOpenFormats(
        locals.user.steamId,
        openSignupFormats.map((f) => f.id),
      ),
      getCartCount(locals.user.steamId),
    ]);
    userTeams = activeTeams;
    isInTeam = signedUpForAllOpen;
    cartCount = cartItems;

    notifications = await getNotificationsForDropdown(locals.user.steamId);
    notificationCount = notifications.filter((n) => !n.isRead).length;
  }

  // Load visible announcements for site-wide display
  const announcements = await getVisibleAnnouncements();

  return {
    user: locals.user || null,
    punishmentNotice,
    devGated: false,
    appEnvironment: locals.appEnvironment,
    realtimeEnabled: isRealtimeNotificationsEnabled(),
    announcements,
    notificationCount,
    notifications,
    signupClosed,
    isInTeam,
    userTeams,
    cartCount,
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
