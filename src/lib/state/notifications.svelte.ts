/**
 * Notification State - Svelte 5 Runes
 *
 * Manages real-time notification state using $state and $derived runes.
 * Connects to SSE endpoint for live updates without page refresh.
 */

export interface NotificationActor {
  steamId: string;
  steamUsername: string;
  steamAvatar: string | null;
}

export interface Notification {
  id: number;
  userSteamId: string | null;
  type: string;
  url: string;
  message: string | null;
  actorSteamId: string | null;
  actor: NotificationActor | null;
  isRead: boolean;
  createdAt: Date | string;
}

class NotificationState {
  notifications = $state<Notification[]>([]);
  hasNewNotification = $state(false);
  private eventSource: EventSource | null = null;
  private initialized = false;

  /**
   * Computed: Number of unread notifications
   */
  get unreadCount() {
    return this.notifications.filter((n) => !n.isRead).length;
  }

  /**
   * Computed: Only unread notifications
   */
  get unreadNotifications() {
    return this.notifications.filter((n) => !n.isRead);
  }

  /**
   * Computed: All notifications sorted (unread first, then by date)
   */
  get sortedNotifications() {
    return [...this.notifications].sort((a, b) => {
      // Unread first
      if (a.isRead !== b.isRead) {
        return a.isRead ? 1 : -1;
      }
      // Then by date (newest first)
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }

  /**
   * Computed: Notifications for dropdown (max 10, unread first)
   */
  get dropdownNotifications() {
    return this.sortedNotifications.slice(0, 10);
  }

  /**
   * Initialize the notification state with server data and connect to SSE
   */
  initialize(initialNotifications: Notification[]) {
    if (this.initialized) return;

    this.notifications = initialNotifications;
    this.initialized = true;

    // Only connect to SSE in browser
    if (typeof window !== 'undefined') {
      this.connect();
    }
  }

  /**
   * Connect to the SSE endpoint for real-time updates
   */
  private connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource('/api/notifications/stream');

    this.eventSource.addEventListener('notification', (event) => {
      try {
        const notification: Notification = JSON.parse(event.data);
        // Add new notification to the beginning of the list
        this.notifications = [notification, ...this.notifications];

        // Trigger new notification indicator
        this.hasNewNotification = true;
        setTimeout(() => {
          this.hasNewNotification = false;
        }, 3000);
      } catch (err) {
        console.error('Failed to parse notification:', err);
      }
    });

    this.eventSource.addEventListener('connected', () => {
      console.log('Notifications SSE connected');
    });

    this.eventSource.onerror = () => {
      console.warn('Notifications SSE error, will retry...');
      // EventSource will automatically reconnect
    };
  }

  /**
   * Mark a single notification as read (optimistic update)
   */
  async markAsRead(id: number) {
    // Optimistic update
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n,
    );

    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to mark as read');
      }
    } catch (err) {
      // Revert on error
      this.notifications = this.notifications.map((n) =>
        n.id === id ? { ...n, isRead: false } : n,
      );
      console.error('Error marking notification as read:', err);
    }
  }

  /**
   * Mark all notifications as read (optimistic update)
   */
  async markAllRead() {
    // Store original state for potential rollback
    const originalNotifications = [...this.notifications];

    // Optimistic update
    this.notifications = this.notifications.map((n) => ({
      ...n,
      isRead: true,
    }));

    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to mark all as read');
      }
    } catch (err) {
      // Revert on error
      this.notifications = originalNotifications;
      console.error('Error marking all notifications as read:', err);
    }
  }

  /**
   * Disconnect from SSE and cleanup
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Reset state (for logout, etc.)
   */
  reset() {
    this.disconnect();
    this.notifications = [];
    this.initialized = false;
  }
}

// Export singleton instance
export const notificationState = new NotificationState();
