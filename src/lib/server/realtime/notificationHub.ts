/**
 * Notification Hub
 *
 * Process-local singleton that owns one dedicated pg.Client running
 * LISTEN "notifications". Notification writes pg_notify into that channel;
 * this hub fans the events out in-memory to all active SSE stream subscribers
 * keyed by userSteamId.
 *
 * Connection cost: 1 extra physical connection per replica, regardless of
 * how many users are online (vs. the old model: 1 connection per connected user).
 */

import pg from 'pg';
import { building } from '$app/environment';

const NOTIFY_CHANNEL = 'notifications';

/** Maximum backoff between reconnect attempts (ms). */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Minimum payload size guard — fall back to ID-only payload above this. */
const MAX_NOTIFY_PAYLOAD_BYTES = 7_500;

export interface NotificationPayload {
  id: number;
  userSteamId: string;
  type: string;
  url: string;
  message: string | null;
  actorSteamId: string | null;
  actor: {
    steamId: string;
    steamUsername: string;
    steamAvatar: string | null;
  } | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationIdOnlyPayload {
  id: number;
  userSteamId: string;
  idOnly: true;
}

export type HubPayload = NotificationPayload | NotificationIdOnlyPayload;

export interface HubSubscriber {
  /** Called when a new notification arrives for this subscriber's user. */
  onNotification: (payload: HubPayload) => void;
  /**
   * Called after the listener reconnects following a drop. The subscriber
   * must re-fetch any notifications it may have missed during the gap and
   * re-deliver them (catch-up / backfill).
   */
  onResync: () => void;
}

class NotificationHub {
  private client: pg.Client | null = null;
  private subscribers = new Map<string, Set<HubSubscriber>>();
  private reconnectDelay = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shuttingDown = false;

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.shuttingDown) return;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('[notificationHub] DATABASE_URL not set — hub disabled');
      return;
    }

    const client = new pg.Client({ connectionString });
    this.client = client;

    client.on('error', (err) => {
      console.error('[notificationHub] listener client error:', err.message);
    });

    client.on('end', () => {
      if (!this.shuttingDown) {
        console.warn('[notificationHub] listener connection closed — scheduling reconnect');
        this.scheduleReconnect();
      }
    });

    client.on('notification', (msg) => {
      if (msg.channel !== NOTIFY_CHANNEL || !msg.payload) return;
      try {
        const payload = JSON.parse(msg.payload) as HubPayload;
        this.deliver(payload.userSteamId, payload);
      } catch {
        // Malformed payload — ignore silently
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN "${NOTIFY_CHANNEL}"`);
      this.reconnectDelay = 1_000;
      console.log('[notificationHub] LISTEN "notifications" established');

      // Notify all active subscribers to re-fetch anything missed during the gap
      this.notifyAllResync();
    } catch (err) {
      console.error(
        '[notificationHub] failed to connect:',
        err instanceof Error ? err.message : err,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) return;

    this.client = null;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff up to MAX_RECONNECT_DELAY_MS
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  private notifyAllResync(): void {
    for (const subs of this.subscribers.values()) {
      for (const sub of subs) {
        try {
          sub.onResync();
        } catch {
          // Subscriber tear-down error — ignore
        }
      }
    }
  }

  /**
   * Subscribe to notifications for a specific user.
   * Returns an unsubscribe function — call it when the SSE stream closes.
   */
  subscribe(steamId: string, subscriber: HubSubscriber): () => void {
    if (!this.subscribers.has(steamId)) {
      this.subscribers.set(steamId, new Set());
    }
    this.subscribers.get(steamId)!.add(subscriber);

    return () => {
      const subs = this.subscribers.get(steamId);
      if (subs) {
        subs.delete(subscriber);
        if (subs.size === 0) {
          this.subscribers.delete(steamId);
        }
      }
    };
  }

  /**
   * Deliver a payload to all subscribers for the given user.
   * Called by the pg notification event handler.
   */
  deliver(steamId: string, payload: HubPayload): void {
    const subs = this.subscribers.get(steamId);
    if (!subs || subs.size === 0) return;

    for (const sub of subs) {
      try {
        sub.onNotification(payload);
      } catch {
        // Subscriber error — do not let it crash fan-out
      }
    }
  }

  /** Total number of active subscribers (for observability). */
  get subscriberCount(): number {
    let total = 0;
    for (const subs of this.subscribers.values()) {
      total += subs.size;
    }
    return total;
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      try {
        await this.client.end();
      } catch {
        // Best-effort shutdown
      }
      this.client = null;
    }
  }
}

/**
 * Guard payload size against pg_notify's 8000-byte limit.
 * Returns the payload as a JSON string, or an ID-only fallback string.
 */
export function buildNotifyPayload(notification: NotificationPayload): string {
  const full = JSON.stringify(notification);
  if (Buffer.byteLength(full, 'utf8') <= MAX_NOTIFY_PAYLOAD_BYTES) {
    return full;
  }
  // Fall back to ID-only; the SSE route will fetch the full row on resync
  const idOnly: NotificationIdOnlyPayload = {
    id: notification.id,
    userSteamId: notification.userSteamId,
    idOnly: true,
  };
  return JSON.stringify(idOnly);
}

// ---------------------------------------------------------------------------
// Singleton — attached to globalThis so hot-reload doesn't create duplicates
// ---------------------------------------------------------------------------

const globalForHub = globalThis as unknown as { notificationHub: NotificationHub | undefined };

export const notificationHub: NotificationHub = building
  ? (undefined as unknown as NotificationHub)
  : (globalForHub.notificationHub ??= new NotificationHub());

if (!building && typeof window === 'undefined') {
  process.on('beforeExit', async () => {
    await notificationHub.shutdown();
  });
}
