/**
 * Mark Notification as Read API
 * POST /api/notifications/:id/read
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { markAsRead } from '$lib/server/services/notifications';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const notificationId = parseInt(params.id);
	if (isNaN(notificationId)) {
		throw error(400, 'Invalid notification ID');
	}

	try {
		await markAsRead(notificationId, locals.user.steamId);
		return json({ success: true });
	} catch (err) {
		throw error(403, 'Unauthorized or notification not found');
	}
};

