/**
 * Notifications SSE Stream API
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notification updates.
 * Polls the database periodically and sends new notifications to connected clients.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
  getLatestNotificationId,
  getNotificationsSinceId,
} from '$lib/server/services/notifications';

const BASE_POLL_INTERVAL_MS = 15000;
const MAX_POLL_INTERVAL_MS = 60000;
const MAX_POLL_JITTER_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const userSteamId = locals.user.steamId;

  let lastNotificationId = await getLatestNotificationId(userSteamId);

  let isActive = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const safeEnqueue = (data: string): boolean => {
        if (!isActive || controller.desiredSize === null) {
          isActive = false;
          return false;
        }
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          isActive = false;
          return false;
        }
      };

      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

      let lastHeartbeat = Date.now();

      let consecutiveFailures = 0;

      const getNextPollDelay = () => {
        const backoffStep = Math.min(consecutiveFailures, 2);
        const backoffMultiplier = 2 ** backoffStep;
        const baseDelay = BASE_POLL_INTERVAL_MS * backoffMultiplier;
        const jitter = Math.floor(Math.random() * MAX_POLL_JITTER_MS);
        return Math.min(baseDelay + jitter, MAX_POLL_INTERVAL_MS);
      };

      const poll = async () => {
        if (!isActive) return;

        try {
          const newNotifications = await getNotificationsSinceId(userSteamId, lastNotificationId);
          consecutiveFailures = 0;

          for (const notification of newNotifications) {
            if (!safeEnqueue(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`)) {
              return;
            }
            lastNotificationId = notification.id;
          }

          const now = Date.now();
          if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            if (!safeEnqueue(`: heartbeat\n\n`)) {
              return;
            }
            lastHeartbeat = now;
          }
        } catch (err) {
          consecutiveFailures += 1;
          if (isActive) {
            console.error('SSE poll error:', {
              route: '/api/notifications/stream',
              userSteamId,
              consecutiveFailures,
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (isActive) {
          timeoutId = setTimeout(poll, getNextPollDelay());
        }
      };

      poll();
    },
    cancel() {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
