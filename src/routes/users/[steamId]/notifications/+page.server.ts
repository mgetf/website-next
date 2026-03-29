/**
 * User Notifications Page - Server Load
 *
 * Loads all notifications for a user with pagination.
 * Only accessible to the user themselves.
 */

import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/permissions';
import { getErrorMessage } from '$lib/server/utils/errors';
import {
  getAllNotifications,
  getNotificationCounts,
  markAllAsRead,
} from '$lib/server/services/notifications';

const PAGE_SIZE = 20;

export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAuth(locals.user);

  const { steamId } = params;

  // Only allow users to view their own notifications
  if (locals.user.steamId !== steamId) {
    throw error(403, 'You can only view your own notifications');
  }

  const page = parseInt(url.searchParams.get('page') || '1');
  const offset = (page - 1) * PAGE_SIZE;

  const [notifications, counts] = await Promise.all([
    getAllNotifications(steamId, PAGE_SIZE, offset),
    getNotificationCounts(steamId),
  ]);

  const totalPages = Math.ceil(counts.totalCount / PAGE_SIZE);

  return {
    notifications,
    unreadCount: counts.unreadCount,
    totalCount: counts.totalCount,
    currentPage: page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export const actions: Actions = {
  markAllRead: async ({ params, locals }) => {
    requireAuth(locals.user);

    if (locals.user.steamId !== params.steamId) {
      return fail(403, { error: 'Unauthorized' });
    }

    try {
      await markAllAsRead(locals.user.steamId);
      return { success: true };
    } catch (err) {
      return fail(500, { error: getErrorMessage(err, 'Failed to mark all as read') });
    }
  },
};
