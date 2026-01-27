/**
 * Mark All Notifications as Read API
 * POST /api/notifications/mark-all-read
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { markAllAsRead } from '$lib/server/services/notifications';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    await markAllAsRead(locals.user.steamId);
    return json({ success: true });
  } catch (err) {
    throw error(500, 'Failed to mark notifications as read');
  }
};
