/**
 * Notifications SSE Stream
 * GET /api/notifications/stream
 *
 * Server-Sent Events endpoint for real-time notification push.
 *
 * On connect:
 *  1. Subscribe to the in-memory hub BEFORE reading the DB (avoids
 *     subscribe-before-load race where a NOTIFY fires in the gap).
 *  2. Backfill once: fetch all notifications since the most recent ID.
 *  3. Stream hub-delivered events thereafter — no DB polling.
 *  4. A lightweight heartbeat timer keeps the connection alive; it makes
 *     no database calls.
 *
 * When the listener reconnects after a drop, the hub calls onResync() on
 * every active subscriber. This triggers a fresh backfill to recover any
 * notifications that arrived during the gap (missed NOTIFYs).
 */

import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import {
  getLatestNotificationId,
  getNotificationsSinceId,
} from '$lib/server/services/notifications';
import { notificationHub } from '$lib/server/realtime/notificationHub';
import type { HubPayload, NotificationIdOnlyPayload } from '$lib/server/realtime/notificationHub';
import { isRealtimeNotificationsEnabled } from '$lib/server/utils/env';

const HEARTBEAT_INTERVAL_MS = 30_000;

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }

  const userSteamId = locals.user.steamId;

  if (!isRealtimeNotificationsEnabled()) {
    // Kill switch: acknowledge the connect request and close immediately.
    // The client will not reconnect (it checks realtimeEnabled before opening
    // the EventSource). This branch is a server-side safety net only.
    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: ${JSON.stringify({ connected: true, realtime: false })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  let isActive = true;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
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

      // Cursor tracks the highest notification id delivered to this stream.
      // Initialized after the first backfill; updated as notifications arrive.
      let cursor = 0;

      const deliverPayload = (payload: HubPayload) => {
        if (!isActive) return;

        // ID-only payload — will be caught up via the next onResync call, so skip now
        if ((payload as NotificationIdOnlyPayload).idOnly) return;

        // De-duplicate: ignore if already past this id
        if (payload.id <= cursor) return;

        cursor = payload.id;
        safeEnqueue(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const resync = async () => {
        if (!isActive) return;
        try {
          const missed = await getNotificationsSinceId(userSteamId, cursor);
          for (const n of missed) {
            if (!isActive) break;
            if (n.id <= cursor) continue;
            cursor = n.id;
            safeEnqueue(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
          }
        } catch {
          // Resync failure is non-fatal; next heartbeat or hub reconnect will retry
        }
      };

      // Step 1: subscribe BEFORE reading the DB to close the race window
      unsubscribe = notificationHub.subscribe(userSteamId, {
        onNotification: deliverPayload,
        onResync: () => {
          resync();
        },
      });

      // Step 2: initial backfill
      try {
        cursor = await getLatestNotificationId(userSteamId);
        // Fetch anything that arrived between the hub connecting and now
        await resync();
      } catch {
        // Non-fatal — stream still works, just without historical backfill
      }

      safeEnqueue(
        `event: connected\ndata: ${JSON.stringify({ connected: true, realtime: true })}\n\n`,
      );

      // Step 3: heartbeat only — no DB calls
      heartbeatTimer = setInterval(() => {
        if (!safeEnqueue(`: heartbeat\n\n`)) {
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);
    },

    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    isActive = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
