/**
 * Notifications SSE Stream API
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notification updates.
 * Polls the database periodically and sends new notifications to connected clients.
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const HEARTBEAT_INTERVAL_MS = 30000; // Send heartbeat every 30 seconds

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const userSteamId = locals.user.steamId;

  // Track the last notification ID we've seen
  let lastNotificationId = 0;

  // Get the current max notification ID to start from
  const latestNotification = await prisma.notification.findFirst({
    where: { userSteamId },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  if (latestNotification) {
    lastNotificationId = latestNotification.id;
  }

  // Shared state for cleanup
  let isActive = true;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to safely enqueue data
      const safeEnqueue = (data: string): boolean => {
        // Check if controller is still open
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

      // Send initial connection message
      safeEnqueue(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

      let lastHeartbeat = Date.now();

      // Polling function
      const poll = async () => {
        if (!isActive) return;

        try {
          // Check for new notifications since lastNotificationId
          const newNotifications = await prisma.notification.findMany({
            where: {
              userSteamId,
              id: { gt: lastNotificationId },
            },
            orderBy: { id: 'asc' },
          });

          // Send each new notification
          for (const notification of newNotifications) {
            if (!safeEnqueue(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`)) {
              return; // Stream closed, stop polling
            }
            lastNotificationId = notification.id;
          }

          // Send heartbeat if needed
          const now = Date.now();
          if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
            if (!safeEnqueue(`: heartbeat\n\n`)) {
              return; // Stream closed, stop polling
            }
            lastHeartbeat = now;
          }
        } catch (err) {
          // Only log if it's not a controller closed error
          if (isActive) {
            console.error('SSE poll error:', err);
          }
        }

        // Schedule next poll if still active
        if (isActive) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      };

      // Start polling
      poll();
    },
    cancel() {
      // Stream was canceled by client - cleanup
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
